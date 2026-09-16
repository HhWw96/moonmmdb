///|
/// One operation owns its budget, including keys and pointer traversal.
priv struct Decode {
  data : Bytes
  base : Int
  end : Int
  limits : Limits
  mut remaining : Int
  mut payload : Int
  active : Array[Int]
}

///|
fn decoder(data : Bytes, base : Int, end : Int, limits : Limits) -> Decode {
  {
    data,
    base,
    end,
    limits,
    remaining: limits.max_values,
    payload: limits.max_payload_bytes,
    active: [],
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
) -> (Value, Int) raise MmdbError {
  let control = ctx.data[offset].to_int()
  let mut kind = control >> 5
  let mut pos = offset + 1
  if kind == 1 {
    let width = ((control >> 3) & 3) + 1
    let mut pointer = uint_be(ctx, pos, width)
    if width < 4 {
      pointer = pointer | ((control & 7).to_uint64() << (width * 8))
    }
    if width == 2 {
      pointer = pointer + 2048
    }
    if width == 3 {
      pointer = pointer + 526336
    }
    if pointer >= (ctx.end - ctx.base).to_uint64() {
      raise MmdbError("out-of-bounds", offset, "Pointer outside data section")
    }
    let target = ctx.base + pointer.to_int()
    if ctx.data[target].to_int() >> 5 == 1 {
      raise MmdbError(
        "pointer-to-pointer", offset, "Pointer targets another pointer",
      )
    }
    let (value, _) = decode(ctx, target, depth + 1)
    return (value, pos + width)
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
    size = base + uint_be(ctx, pos, extra).to_int()
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
        let (value, next) = decode(ctx, pos, depth + 1)
        items.push(value)
        pos = next
      }
      return (List(items), pos)
    }
    let items : Array[(String, Value)] = []
    let seen : Map[String, Bool] = Map([])
    for _ in 0..<size {
      let (key, next) = decode(ctx, pos, depth + 1)
      let name = match key {
        Text(s) => s
        _ =>
          raise MmdbError(
            "invalid-map-key", pos, "Map key must be a UTF-8 string",
          )
      }
      if seen.contains(name) {
        raise MmdbError(
          "duplicate-key", pos, "Duplicate map key is outside reader profile",
        )
      }
      seen[name] = true
      let (value, after) = decode(ctx, next, depth + 1)
      items.push((name, value))
      pos = after
    }
    return (Object(items), pos)
  }
  if kind == 14 {
    if size > 1 {
      raise MmdbError(
        "invalid-size", offset, "Boolean size must be zero or one",
      )
    }
    return (Boolean(size == 1), pos)
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
    5 => Unsigned16(uint_be(ctx, pos, size).to_uint())
    6 => Unsigned32(uint_be(ctx, pos, size).to_uint())
    8 => Signed32(uint_be(ctx, pos, size).to_int())
    9 => Unsigned64(uint_be(ctx, pos, size))
    10 => Unsigned128(decimal_bytes(ctx.data, pos, size))
    15 => Real32({ bits: uint_be(ctx, pos, size).to_uint(), })
    _ => raise MmdbError("unsupported-type", offset, "Unsupported MMDB scalar")
  }
  (value, end)
}
