///|
pub struct DiagnosticBuffer {
  priv limit : Int32
  priv rows : Array[Json]
  priv mut bytes : Int32
  priv mut full : Bool
  priv mut omitted : UInt64
}

///|
pub fn DiagnosticBuffer::new(limit : Int32) -> DiagnosticBuffer {
  {
    limit: limit.max(0).min(1000),
    rows: [],
    bytes: 0,
    full: false,
    omitted: 0,
  }
}

///|
#warnings("-deprecated")
pub fn DiagnosticBuffer::add(
  self : DiagnosticBuffer,
  outcome : Json,
  line : Int32,
  start : Int32,
  end : Int32,
) -> Unit {
  let abnormal = match outcome {
    { "input": String(input), "issues": Array(issues), .. } =>
      input != "valid" || !issues.is_empty()
    _ => false
  }
  if !abnormal {
    return
  }
  if self.full || self.rows.length() >= self.limit {
    self.omitted += 1
    return
  }
  let row : Json = {
    "line": @json.to_json(line.to_string()),
    "start": @json.to_json(start.to_string()),
    "end": @json.to_json(end.to_string()),
    "outcome": @json.parse(outcome.stringify()) catch {
      _ => null
    },
  }
  let length = @utf8.encode(row.stringify()[:]).length()
  if self.bytes + length > 524288 {
    self.full = true
    self.omitted += 1
  } else {
    self.rows.push(row)
    self.bytes += length
  }
}

///|
#warnings("-deprecated")
pub fn DiagnosticBuffer::to_json(self : DiagnosticBuffer) -> Json {
  {
    "limit": @json.to_json(self.limit),
    "retained": @json.to_json(self.rows.length().to_string()),
    "omitted": @json.to_json(self.omitted.to_string()),
    "rows": @json.parse(@json.to_json(self.rows).stringify()) catch {
      _ => []
    },
  }
}

///|
fn detailed_ip(value : Json, tokens : Array[String]) -> (String?, String) {
  match value {
    Object(_) => ()
    _ => return (None, "invalid-jsonl")
  }
  let mut selected = value
  for token in tokens {
    selected = match selected {
      Object(m) =>
        match m.get(token) {
          Some(v) => v
          None => return (None, "missing-ip")
        }
      Array(a) => {
        if token.is_empty() || (token.length() > 1 && token[0] == '0') {
          return (None, "missing-ip")
        }
        let mut index = 0
        for ch in token.iter() {
          if ch < '0' || ch > '9' || index > a.length() / 10 {
            return (None, "missing-ip")
          }
          index = index * 10 + ch.to_int() - 48
        }
        if index >= a.length() {
          return (None, "missing-ip")
        }
        a[index]
      }
      _ => return (None, "missing-ip")
    }
  }
  match selected {
    String(ip) => (Some(ip), "valid")
    _ => (None, "ip-type-error")
  }
}

///|
#export_name("analysis_line_detailed")
#warnings("-deprecated")
pub fn analysis_line_detailed(handle : AnalysisHandle, text : String) -> String {
  if handle.error != "" {
    return handle.error
  }
  match handle.analyzer {
    None => "{\"status\":\"error\",\"code\":\"analyzer-closed\"}"
    Some(analyzer) => {
      let (ip, reason) = detailed_ip(
        @json.parse(text[:], max_nesting_depth=128),
        handle.tokens,
      ) catch {
        _ => (None, "invalid-jsonl")
      }
      try {
        match ip {
          Some(ip) => analyzer.push_detailed(ip).to_json().stringify()
          None => {
            analyzer.invalid_input()
            let result : Json = { "input": @json.to_json(reason), "issues": [] }
            result.stringify()
          }
        }
      } catch {
        e => {
          handle.error = e.to_json().stringify()
          handle.error
        }
      }
    }
  }
}

///|
#export_name("diagnostics_create")
pub fn diagnostics_create(limit : Int32) -> DiagnosticBuffer {
  DiagnosticBuffer::new(limit)
}

///|
#export_name("diagnostics_add")
#warnings("-deprecated")
pub fn diagnostics_add(
  buffer : DiagnosticBuffer,
  outcome : String,
  line : Int32,
  start : Int32,
  end : Int32,
) -> Unit {
  let value = @json.parse(outcome[:], max_nesting_depth=128) catch { _ => null }
  buffer.add(value, line, start, end)
}

///|
#export_name("diagnostics_finish")
pub fn diagnostics_finish(buffer : DiagnosticBuffer) -> String {
  buffer.to_json().stringify()
}

///|
#export_name("extract_input_ip")
#warnings("-deprecated")
pub fn extract_input_ip(text : String, path : String) -> String {
  let ip = try {
    @mmdb.validate_paths([path])
    let tokens = if path == "" {
      []
    } else {
      path[1:]
      .split("/")
      .map(s => {
        s
        .to_owned()
        .replace_all(old="~1", new="/")
        .replace_all(old="~0", new="~")
      })
      .to_array()
    }
    let (value, _) = detailed_ip(
      @json.parse(text[:], max_nesting_depth=128),
      tokens,
    )
    value
  } catch {
    _ => None
  }
  let value : Json = {
    "ip": match ip {
      Some(s) => @json.to_json(s)
      None => null
    },
  }
  value.stringify()
}
