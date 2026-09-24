///|
/// One operation owns its budget, including keys and pointer traversal.
priv struct Decode {
  data : Bytes
  base : Int
  end : Int
  limits : Limits
  mut remaining : Int
  mut payload : Int
  mut next : Int
  active : Array[Int]
  work : OperationWork?
}

///|
fn decoder(
  data : Bytes,
  base : Int,
  end : Int,
  limits : Limits,
  work? : OperationWork? = None,
) -> Decode {
  {
    data,
    base,
    end,
    limits,
    remaining: limits.max_values,
    payload: limits.max_payload_bytes,
    next: base,
    active: [],
    work,
  }
}

///|
fn bounded(ctx : Decode, offset : Int, size : Int) -> Unit raise MmdbError {
  if offset < ctx.base ||
    size < 0 ||
    offset > ctx.end ||
    size > ctx.end - offset {
    raise MmdbError("out-of-bounds", offset, "Value exceeds its section")
  }
}

///|
fn uint_be(ctx : Decode, offset : Int, size : Int) -> UInt64 raise MmdbError {
  bounded(ctx, offset, size)
  let mut value : UInt64 = 0
  for i in offset..<(offset + size) {
    value = (value << 8) | ctx.data[i].to_uint64()
  }
  value
}

///|
// Encoded offsets and 16/32-bit scalars do not need a 64-bit accumulator.
fn uint32_be(ctx : Decode, offset : Int, size : Int) -> UInt raise MmdbError {
  bounded(ctx, offset, size)
  let mut value : UInt = 0
  for i in offset..<(offset + size) {
    value = (value << 8) | ctx.data[i].to_uint()
  }
  value
}

///|
/// Base-10 arithmetic avoids any floating-point conversion of UInt128.
fn decimal_bytes(data : Bytes, offset : Int, size : Int) -> String {
  let digits : Array[Int] = [0]
  for i in offset..<(offset + size) {
    let mut carry = data[i].to_int()
    for j in 0..<digits.length() {
      let n = digits[j] * 256 + carry
      digits[j] = n % 10
      carry = n / 10
    }
    while carry > 0 {
      digits.push(carry % 10)
      carry = carry / 10
    }
  }
  let out = StringBuilder()
  for i = digits.length() - 1; i >= 0; i = i - 1 {
    out.write_string(digits[i].to_string())
  }
  out.to_string()
}

///|
fn decode(
  ctx : Decode,
  offset : Int,
  depth : Int,
) -> (Value, Int) raise MmdbError {
  let value = decode_into(ctx, offset, depth)
  (value, ctx.next)
}

///|
// Recursive calls share an operation-local next offset instead of allocating
// a (Value, Int) pair for every decoded value. Pointer returns restore their
// own encoded end; they never expose the referenced record's end to a parent.
fn decode_into(
  ctx : Decode,
  offset : Int,
  depth : Int,
) -> Value raise MmdbError {
  bounded(ctx, offset, 1)
  if depth > ctx.limits.max_depth {
    raise MmdbError("depth-limit", offset, "Nesting budget exhausted")
  }
  if ctx.remaining <= 0 {
    raise MmdbError("value-limit", offset, "Decode work budget exhausted")
  }
  if ctx.active.contains(offset) {
    raise MmdbError("pointer-cycle", offset, "Cyclic data reference")
  }
  ctx.remaining = ctx.remaining - 1
  if ctx.work is Some(work) {
    work.charge(1, offset)
  }
  ctx.active.push(offset)
  let result = decode_value(ctx, offset, depth)
  ignore(ctx.active.pop())
  result
}

///|
fn decode_value(
  ctx : Decode,
  offset : Int,
  depth : Int,
) -> Value raise MmdbError {
  let control = ctx.data[offset].to_int()
  let mut kind = control >> 5
  let mut pos = offset + 1
  if kind == 1 {
    let width = ((control >> 3) & 3) + 1
    let mut pointer = uint32_be(ctx, pos, width)
    if width < 4 {
      pointer = pointer | ((control & 7).reinterpret_as_uint() << (width * 8))
    }
    if width == 2 {
      pointer = pointer + 2048
    }
    if width == 3 {
      pointer = pointer + 526336
    }
    if pointer >= (ctx.end - ctx.base).reinterpret_as_uint() {
      raise MmdbError("out-of-bounds", offset, "Pointer outside data section")
    }
    let target = ctx.base + pointer.reinterpret_as_int()
    if ctx.data[target].to_int() >> 5 == 1 {
      raise MmdbError(
        "pointer-to-pointer", offset, "Pointer targets another pointer",
      )
    }
    let value = decode_into(ctx, target, depth + 1)
    ctx.next = pos + width
    return value
  }
  if kind == 0 {
    bounded(ctx, pos, 1)
    kind = ctx.data[pos].to_int() + 7
    pos = pos + 1
  }
  let mut size = control & 31
  if size >= 29 {
    let extra = size - 28
    let base = if size == 29 { 29 } else if size == 30 { 285 } else { 65821 }
    size = base + uint32_be(ctx, pos, extra).reinterpret_as_int()
    pos = pos + extra
  }
  if kind == 7 || kind == 11 {
    let children = if kind == 7 { size * 2 } else { size }
    if children > ctx.remaining {
      raise MmdbError(
        "value-limit", offset, "Declared container exceeds work budget",
      )
    }
    if kind == 11 {
      let items : Array[Value] = []
      for _ in 0..<size {
        let value = decode_into(ctx, pos, depth + 1)
        items.push(value)
        pos = ctx.next
      }
      ctx.next = pos
      return List(items)
    }
    let items : Array[(String, Value)] = []
    // Small MMDB maps already retain their keys in items. Reuse that storage
    // for duplicate checks, bounding the linear scan to at most 16 entries.
    // Large maps keep hash lookup to avoid quadratic hostile-input work.
    let seen : Map[String, Bool]? = if size > 16 { Some(Map([])) } else { None }
    for _ in 0..<size {
      let key = decode_into(ctx, pos, depth + 1)
      let next = ctx.next
      let name = match key {
        Text(s) => s
        _ =>
          raise MmdbError(
            "invalid-map-key", pos, "Map key must be a UTF-8 string",
          )
      }
      let duplicate = match seen {
        Some(seen) => seen.contains(name)
        None => items.any(fn(item) { item.0 == name })
      }
      if duplicate {
        raise MmdbError(
          "duplicate-key", pos, "Duplicate map key is outside reader profile",
        )
      }
      if seen is Some(seen) {
        seen[name] = true
      }
      let value = decode_into(ctx, next, depth + 1)
      items.push((name, value))
      pos = ctx.next
    }
    ctx.next = pos
    return Object(items)
  }
  if kind == 14 {
    if size > 1 {
      raise MmdbError(
        "invalid-size", offset, "Boolean size must be zero or one",
      )
    }
    ctx.next = pos
    return Boolean(size == 1)
  }
  let max_size = match kind {
    2 | 4 => size
    3 => 8
    5 => 2
    6 | 8 | 15 => 4
    9 => 8
    10 => 16
    _ =>
      raise MmdbError(
        "unsupported-type", offset, "Unsupported or reserved MMDB type",
      )
  }
  if size > max_size || ((kind == 3 || kind == 15) && size != max_size) {
    raise MmdbError("invalid-size", offset, "Invalid encoded scalar size")
  }
  bounded(ctx, pos, size)
  let end = pos + size
  let value = match kind {
    2 | 4 => {
      if size > ctx.payload {
        raise MmdbError(
          "payload-limit", offset, "Expanded bytes budget exhausted",
        )
      }
      ctx.payload = ctx.payload - size
      if ctx.work is Some(work) {
        work.charge((size + 63) / 64, offset)
      }
      if kind == 2 {
        let text = @utf8.decode(ctx.data[pos:end], ignore_bom=false) catch {
          _ => raise MmdbError("invalid-utf8", pos, "String is not valid UTF-8")
        }
        Text(text)
      } else {
        Blob(ctx.data[pos:end].to_owned())
      }
    }
    3 => Real64({ bits: uint_be(ctx, pos, size), })
    5 => Unsigned16(uint32_be(ctx, pos, size))
    6 => Unsigned32(uint32_be(ctx, pos, size))
    8 => Signed32(uint32_be(ctx, pos, size).reinterpret_as_int())
    9 => Unsigned64(uint_be(ctx, pos, size))
    10 => Unsigned128(decimal_bytes(ctx.data, pos, size))
    15 => Real32({ bits: uint32_be(ctx, pos, size), })
    _ => raise MmdbError("unsupported-type", offset, "Unsupported MMDB scalar")
  }
  ctx.next = end
  value
}
