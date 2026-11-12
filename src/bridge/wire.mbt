///|
// This writer is private to the bridge. Its inputs are Reader results, whose
// map keys and prepared field/source names have already been checked for
// duplicates. Public to_json methods still return independent JSON objects.
fn wire_string(out : StringBuilder, text : String) -> Unit {
  out.write_char('"')
  let mut needs_escape = false
  // Escaping only depends on ASCII code units. Scan without a Unicode
  // iterator; the unchanged writer below handles escaped Unicode text.
  for i in 0..<text.length() {
    let ch = text[i]
    if ch == '"' || ch == '\\' || ch.to_int() < 32 {
      needs_escape = true
      break
    }
  }
  if !needs_escape {
    out.write_string(text)
    out.write_char('"')
    return
  }
  for ch in text.iter() {
    match ch {
      '"' => out.write_string("\\\"")
      '\\' => out.write_string("\\\\")
      '\n' => out.write_string("\\n")
      '\r' => out.write_string("\\r")
      '\t' => out.write_string("\\t")
      '\b' => out.write_string("\\b")
      '\u{000c}' => out.write_string("\\f")
      _ => {
        let code = ch.to_int()
        if code < 32 {
          out.write_string("\\u00")
          if code < 16 {
            out.write_char('0')
          }
          out.write_string(code.to_string(radix=16))
        } else {
          out.write_char(ch)
        }
      }
    }
  }
  out.write_char('"')
}

///|
// Errors on a log row need no intermediate Json map or boxed scalar values.
fn wire_error_into(out : StringBuilder, error : @mmdb.MmdbError) -> Unit {
  out.write_string("{\"status\":\"error\",\"code\":")
  wire_string(out, error.code())
  out.write_string(",\"offset\":")
  out.write_string(error.offset().to_string())
  out.write_string(",\"message\":")
  wire_string(out, error.message())
  out.write_char('}')
}

///|
fn wire_error(error : @mmdb.MmdbError) -> String {
  let out = StringBuilder()
  wire_error_into(out, error)
  out.to_string()
}

///|
fn wire_value(out : StringBuilder, value : @mmdb.Value) -> Unit {
  match value {
    Text(text) => {
      out.write_string("{\"type\":\"string\",\"value\":")
      wire_string(out, text)
    }
    Blob(bytes) => {
      out.write_string("{\"type\":\"bytes\",\"value\":")
      out.write_char('"')
      for byte in bytes {
        let code = byte.to_int()
        if code < 16 {
          out.write_char('0')
        }
        out.write_string(code.to_string(radix=16))
      }
      out.write_char('"')
    }
    Boolean(value) => {
      out.write_string("{\"type\":\"boolean\",\"value\":")
      out.write_string(if value { "true" } else { "false" })
    }
    Unsigned16(value) => {
      out.write_string("{\"type\":\"uint16\",\"value\":")
      wire_string(out, value.to_string())
    }
    Unsigned32(value) => {
      out.write_string("{\"type\":\"uint32\",\"value\":")
      wire_string(out, value.to_string())
    }
    Signed32(value) => {
      out.write_string("{\"type\":\"int32\",\"value\":")
      wire_string(out, value.to_string())
    }
    Unsigned64(value) => {
      out.write_string("{\"type\":\"uint64\",\"value\":")
      wire_string(out, value.to_string())
    }
    Unsigned128(value) => {
      out.write_string("{\"type\":\"uint128\",\"value\":")
      wire_string(out, value)
    }
    Real32(value) => {
      out.write_string("{\"type\":\"float32\",\"value\":")
      wire_string(out, value.number().to_string())
      out.write_string(",\"bits\":")
      wire_string(out, value.bits.to_string(radix=16))
    }
    Real64(value) => {
      out.write_string("{\"type\":\"float64\",\"value\":")
      wire_string(out, value.number().to_string())
      out.write_string(",\"bits\":")
      wire_string(out, value.bits.to_string(radix=16))
    }
    List(items) => {
      out.write_string("{\"type\":\"array\",\"value\":")
      out.write_char('[')
      for i in 0..<items.length() {
        if i > 0 {
          out.write_char(',')
        }
        wire_value(out, items[i])
      }
      out.write_char(']')
    }
    Object(items) => {
      out.write_string("{\"type\":\"map\",\"value\":")
      out.write_char('{')
      for i in 0..<items.length() {
        if i > 0 {
          out.write_char(',')
        }
        wire_string(out, items[i].0)
        out.write_char(':')
        wire_value(out, items[i].1)
      }
      out.write_char('}')
    }
  }
  out.write_char('}')
}

///|
fn wire_projection(out : StringBuilder, value : @mmdb.Projection) -> Unit {
  out.write_string(
    if value.record_found {
      "{\"status\":\"found\",\"prefix_length\":"
    } else {
      "{\"status\":\"not_found\",\"prefix_length\":"
    },
  )
  out.write_string(value.prefix_length.to_string())
  out.write_string(",\"fields\":{")
  for i in 0..<value.fields.length() {
    if i > 0 {
      out.write_char(',')
    }
    wire_string(out, value.fields[i].0)
    out.write_char(':')
    match value.fields[i].1 {
      Some(selected) => {
        out.write_string("{\"status\":\"present\",\"value\":")
        wire_value(out, selected)
        out.write_char('}')
      }
      None => out.write_string("{\"status\":\"missing\"}")
    }
  }
  out.write_string("}}")
}

///|
fn wire_enrichment(value : @mmdb.Enrichment) -> String {
  let out = StringBuilder()
  out.write_string(
    match value.status_code() {
      0 => "{\"status\":\"found\",\"sources\":{"
      1 => "{\"status\":\"not_found\",\"sources\":{"
      _ => "{\"status\":\"error\",\"sources\":{"
    },
  )
  for i in 0..<value.sources.length() {
    if i > 0 {
      out.write_char(',')
    }
    wire_string(out, value.sources[i].0)
    out.write_char(':')
    match value.sources[i].1 {
      Selected(projection) => wire_projection(out, projection)
      Failed(error) => wire_error_into(out, error)
    }
  }
  out.write_string("}}")
  out.to_string()
}
