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
  mut failure : MmdbError?
  mut key_text : String
  mut key_valid : Bool
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
    failure: None,
    key_text: "",
    key_valid: false,
  }
}

///|
// Recursive success paths return plain values. Only the outer operation raises
// its first terminal error, avoiding an allocated result at every tree level.
fn decode_failure(
  ctx : Decode,
  code : String,
  offset : Int,
  message : String,
) -> Value {
  if ctx.failure is None {
    ctx.failure = Some(MmdbError(code, offset, message))
  }
  discarded_value
}

///|
fn bounded(ctx : Decode, offset : Int, size : Int) -> Bool {
  if offset < ctx.base ||
    size < 0 ||
    offset > ctx.end ||
    size > ctx.end - offset {
    ignore(
      decode_failure(ctx, "out-of-bounds", offset, "Value exceeds its section"),
    )
    return false
  }
  true
}

///|
fn uint_be(ctx : Decode, offset : Int, size : Int) -> UInt64 {
  if !bounded(ctx, offset, size) {
    return 0
  }
  let mut high : UInt = 0
  let mut low : UInt = 0
  for i in offset..<(offset + size) {
    high = (high << 8) | (low >> 24)
    low = (low << 8) | ctx.data[i].to_uint()
  }
  (high.to_uint64() << 32) | low.to_uint64()
}

///|
// Encoded offsets and 16/32-bit scalars do not need a 64-bit accumulator.
fn uint32_be(ctx : Decode, offset : Int, size : Int) -> UInt {
  if !bounded(ctx, offset, size) {
    return 0
  }
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
  retention? : Retention = All,
) -> (Value, Int) raise MmdbError {
  let value = decode_into(ctx, offset, depth, retention~)
  if ctx.failure is Some(error) {
    raise error
  }
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
  retention? : Retention = All,
) -> Value {
  if ctx.failure is Some(_) {
    return discarded_value
  }
  if !bounded(ctx, offset, 1) {
    return discarded_value
  }
  if depth > ctx.limits.max_depth {
    return decode_failure(
      ctx, "depth-limit", offset, "Nesting budget exhausted",
    )
  }
  if ctx.remaining <= 0 {
    return decode_failure(
      ctx, "value-limit", offset, "Decode work budget exhausted",
    )
  }
  let mut cyclic = false
  for active in ctx.active {
    if active == offset {
      cyclic = true
      break
    }
  }
  if cyclic {
    return decode_failure(ctx, "pointer-cycle", offset, "Cyclic data reference")
  }
  ctx.remaining = ctx.remaining - 1
  if ctx.work is Some(work) {
    work.charge(1, offset) catch {
      error => {
        ctx.failure = Some(error)
        return discarded_value
      }
    }
  }
  ctx.active.push(offset)
  if retention is MapKey {
    ctx.key_valid = false
  }
  let result = decode_value(ctx, offset, depth, retention~)
  ignore(ctx.active.pop())
  result
}

///|
fn decode_value(
  ctx : Decode,
  offset : Int,
  depth : Int,
  retention? : Retention = All,
) -> Value {
  let control = ctx.data[offset].to_int()
  let mut kind = control >> 5
  let mut pos = offset + 1
  if kind == 1 {
    let width = ((control >> 3) & 3) + 1
    let mut pointer = uint32_be(ctx, pos, width)
    if ctx.failure is Some(_) {
      return discarded_value
    }
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
      return decode_failure(
        ctx, "out-of-bounds", offset, "Pointer outside data section",
      )
    }
    let target = ctx.base + pointer.reinterpret_as_int()
    if ctx.data[target].to_int() >> 5 == 1 {
      return decode_failure(
        ctx, "pointer-to-pointer", offset, "Pointer targets another pointer",
      )
    }
    let value = decode_into(ctx, target, depth + 1, retention~)
    if ctx.failure is Some(_) {
      return discarded_value
    }
    ctx.next = pos + width
    return value
  }
  if kind == 0 {
    if !bounded(ctx, pos, 1) {
      return discarded_value
    }
    kind = ctx.data[pos].to_int() + 7
    pos = pos + 1
  }
  let mut size = control & 31
  if size >= 29 {
    let extra = size - 28
    let base = if size == 29 { 29 } else if size == 30 { 285 } else { 65821 }
    size = base + uint32_be(ctx, pos, extra).reinterpret_as_int()
    if ctx.failure is Some(_) {
      return discarded_value
    }
    pos = pos + extra
  }
  if kind == 7 || kind == 11 {
    let children = if kind == 7 { size * 2 } else { size }
    if children > ctx.remaining {
      return decode_failure(
        ctx, "value-limit", offset, "Declared container exceeds work budget",
      )
    }
    if kind == 11 {
      let items : Array[Value] = []
      for index in 0..<size {
        let child = match retention {
          RetainFields(_) => retained_child(retention, index.to_string())
          other => other
        }
        let value = decode_into(ctx, pos, depth + 1, retention=child)
        if ctx.failure is Some(_) {
          return discarded_value
        }
        // Keep original array positions for canonical JSON Pointer indexes.
        if !(retention is Discard) {
          items.push(value)
        }
        pos = ctx.next
      }
      ctx.next = pos
      if retention is MapKey {
        ctx.key_valid = false
      }
      return if retention is Discard { discarded_value } else { List(items) }
    }
    let items : Array[(String, Value)] = []
    // Small MMDB maps already retain their keys in items. Reuse that storage
    // for duplicate checks, bounding the linear scan to at most 16 entries.
    // Large maps keep hash lookup to avoid quadratic hostile-input work.
    let seen : Map[String, Bool]? = if size > 16 { Some(Map([])) } else { None }
    let names : Array[String]? = if size <= 16 && !(retention is All) {
      Some([])
    } else {
      None
    }
    for _ in 0..<size {
      ignore(decode_into(ctx, pos, depth + 1, retention=MapKey))
      if ctx.failure is Some(_) {
        return discarded_value
      }
      let next = ctx.next
      if !ctx.key_valid {
        return decode_failure(
          ctx, "invalid-map-key", pos, "Map key must be a UTF-8 string",
        )
      }
      let name = ctx.key_text
      let duplicate = match seen {
        Some(seen) => seen.contains(name)
        None => {
          // Keep the bounded duplicate scan free of a per-key closure.
          let mut found = false
          match names {
            Some(names) =>
              for key in names {
                if key == name {
                  found = true
                  break
                }
              }
            None =>
              for item in items {
                if item.0 == name {
                  found = true
                  break
                }
              }
          }
          found
        }
      }
      if duplicate {
        return decode_failure(
          ctx, "duplicate-key", pos, "Duplicate map key is outside reader profile",
        )
      }
      if seen is Some(seen) {
        seen[name] = true
      }
      if names is Some(names) {
        names.push(name)
      }
      let child = retained_child(retention, name)
      let value = decode_into(ctx, next, depth + 1, retention=child)
      if ctx.failure is Some(_) {
        return discarded_value
      }
      if !(child is Discard) {
        items.push((name, value))
      }
      pos = ctx.next
    }
    ctx.next = pos
    if retention is MapKey {
      ctx.key_valid = false
    }
    return if retention is Discard { discarded_value } else { Object(items) }
  }
  if kind == 14 {
    if size > 1 {
      return decode_failure(
        ctx, "invalid-size", offset, "Boolean size must be zero or one",
      )
    }
    ctx.next = pos
    return if !(retention is All) {
      discarded_value
    } else {
      Boolean(size == 1)
    }
  }
  let max_size = match kind {
    2 | 4 => size
    3 => 8
    5 => 2
    6 | 8 | 15 => 4
    9 => 8
    10 => 16
    _ =>
      return decode_failure(
        ctx, "unsupported-type", offset, "Unsupported or reserved MMDB type",
      )
  }
  if size > max_size || ((kind == 3 || kind == 15) && size != max_size) {
    return decode_failure(
      ctx, "invalid-size", offset, "Invalid encoded scalar size",
    )
  }
  if !bounded(ctx, pos, size) {
    return discarded_value
  }
  let end = pos + size
  let value = match kind {
    2 | 4 => {
      if size > ctx.payload {
        return decode_failure(
          ctx, "payload-limit", offset, "Expanded bytes budget exhausted",
        )
      }
      ctx.payload = ctx.payload - size
      if ctx.work is Some(work) {
        work.charge((size + 63) / 64, offset) catch {
          error => {
            ctx.failure = Some(error)
            return discarded_value
          }
        }
      }
      if kind == 2 {
        if retention is All || retention is MapKey {
          let text = text_range_into(ctx, pos, size)
          if ctx.failure is Some(_) {
            return discarded_value
          }
          if retention is MapKey {
            ctx.key_text = text
            ctx.key_valid = true
            discarded_value
          } else {
            Text(text)
          }
        } else {
          if !valid_text_range(ctx.data, pos, size) {
            return decode_failure(
              ctx, "invalid-utf8", pos, "String is not valid UTF-8",
            )
          }
          discarded_value
        }
      } else if !(retention is All) {
        discarded_value
      } else {
        Blob(ctx.data[pos:end].to_owned())
      }
    }
    3 => {
      let bits = uint_be(ctx, pos, size)
      if !(retention is All) {
        discarded_value
      } else {
        Real64({ bits, })
      }
    }
    5 => {
      let value = uint32_be(ctx, pos, size)
      if !(retention is All) {
        discarded_value
      } else {
        Unsigned16(value)
      }
    }
    6 => {
      let value = uint32_be(ctx, pos, size)
      if !(retention is All) {
        discarded_value
      } else {
        Unsigned32(value)
      }
    }
    8 => {
      let value = uint32_be(ctx, pos, size).reinterpret_as_int()
      if !(retention is All) {
        discarded_value
      } else {
        Signed32(value)
      }
    }
    9 => {
      let value = uint_be(ctx, pos, size)
      if !(retention is All) {
        discarded_value
      } else {
        Unsigned64(value)
      }
    }
    10 => {
      let value = decimal_bytes(ctx.data, pos, size)
      if !(retention is All) {
        discarded_value
      } else {
        Unsigned128(value)
      }
    }
    15 => {
      let bits = uint32_be(ctx, pos, size)
      if !(retention is All) {
        discarded_value
      } else {
        Real32({ bits, })
      }
    }
    _ =>
      return decode_failure(
        ctx, "unsupported-type", offset, "Unsupported MMDB scalar",
      )
  }
  ctx.next = end
  value
}
