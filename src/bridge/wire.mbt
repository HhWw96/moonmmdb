///|
// This writer is private to the bridge. Its inputs are Reader results, whose
// map keys and prepared field/source names have already been checked for
// duplicates. Public to_json methods still return independent JSON objects.
fn wire_string(out : StringBuilder, text : String) -> Unit {
  out.write_char('"')
  let mut needs_escape = false
  for ch in text.iter() {
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
fn wire_tag(out : StringBuilder, kind : String) -> Unit {
  out.write_string("{\"type\":")
  wire_string(out, kind)
  out.write_string(",\"value\":")
}

///|
fn wire_value(out : StringBuilder, value : @mmdb.Value) -> Unit {
  match value {
    Text(text) => {
      wire_tag(out, "string")
      wire_string(out, text)
    }
    Blob(bytes) => {
      wire_tag(out, "bytes")
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
      wire_tag(out, "boolean")
      out.write_string(if value { "true" } else { "false" })
    }
    Unsigned16(value) => {
      wire_tag(out, "uint16")
      wire_string(out, value.to_string())
    }
    Unsigned32(value) => {
      wire_tag(out, "uint32")
      wire_string(out, value.to_string())
    }
    Signed32(value) => {
      wire_tag(out, "int32")
      wire_string(out, value.to_string())
    }
    Unsigned64(value) => {
      wire_tag(out, "uint64")
      wire_string(out, value.to_string())
    }
    Unsigned128(value) => {
      wire_tag(out, "uint128")
      wire_string(out, value)
    }
    Real32(value) => {
      wire_tag(out, "float32")
      wire_string(out, value.number().to_string())
      out.write_string(",\"bits\":")
      wire_string(out, value.bits.to_string(radix=16))
    }
    Real64(value) => {
      wire_tag(out, "float64")
      wire_string(out, value.number().to_string())
      out.write_string(",\"bits\":")
      wire_string(out, value.bits.to_string(radix=16))
    }
    List(items) => {
      wire_tag(out, "array")
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
      wire_tag(out, "map")
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
  out.write_string("{\"status\":")
  wire_string(out, if value.record_found { "found" } else { "not_found" })
  out.write_string(",\"prefix_length\":")
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
  out.write_string("{\"status\":")
  wire_string(
    out,
    match value.status_code() {
      0 => "found"
      1 => "not_found"
      _ => "error"
    },
  )
  out.write_string(",\"sources\":{")
  for i in 0..<value.sources.length() {
    if i > 0 {
      out.write_char(',')
    }
    wire_string(out, value.sources[i].0)
    out.write_char(':')
    match value.sources[i].1 {
      Selected(projection) => wire_projection(out, projection)
      Failed(error) => out.write_string(error.to_json().stringify())
    }
  }
  out.write_string("}}")
  out.to_string()
}
