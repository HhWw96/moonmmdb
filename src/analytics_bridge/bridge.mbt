///|
pub struct AnalysisHandle {
  priv mut analyzer : @analytics.Analyzer?
  priv mut error : String
  priv metadata : Json
  priv tokens : Array[String]
}

///|
pub fn analysis_from_readers(
  city : @mmdb.Reader,
  asn : @mmdb.Reader,
  top : Int,
  max_groups : Int,
  ip_path : String,
) -> AnalysisHandle {
  let mut metadata : Json = null
  let mut error = ""
  let analyzer = Some(
    {
      let _ = @mmdb.prepare_fields([ip_path])
      fn info(reader : @mmdb.Reader) -> Json {
        let m = reader.metadata()
        {
          "database_type": m.database_type.to_json(),
          "build_epoch": m.build_epoch.to_string().to_json(),
        }
      }
      metadata = { "city": info(city), "asn": info(asn) }
      @analytics.Analyzer::new(city, asn, limits={ top, max_groups, })
    },
  ) catch {
    @mmdb.MmdbError(_) as e => {
      error = e.to_json().stringify()
      None
    }
    @analytics.AnalyticsError(_) as e => {
      error = e.to_json().stringify()
      None
    }
    _ => {
      error = "{\"status\":\"error\",\"code\":\"analysis-initialization\"}"
      None
    }
  }
  let tokens = if ip_path == "" {
    []
  } else {
    ip_path[1:]
    .split("/")
    .map(fn(s) {
      s.to_owned().replace_all(old="~1", new="/").replace_all(old="~0", new="~")
    })
    .to_array()
  }
  { analyzer, error, metadata, tokens, }
}

///|
#export_name("analysis_error")
pub fn analysis_error(handle : AnalysisHandle) -> String {
  handle.error
}

///|
#export_name("analysis_metadata")
pub fn analysis_metadata(handle : AnalysisHandle) -> String {
  handle.metadata.stringify()
}

///|
fn ip_from_json(value : Json, tokens : Array[String]) -> String? {
  match value {
    Object(_) => ()
    _ => return None
  }
  let mut selected = value
  for token in tokens {
    match selected {
      Object(m) =>
        match m.get(token) {
          Some(v) => selected = v
          None => return None
        }
      Array(a) => {
        let mut index = 0
        if token.is_empty() || (token.length() > 1 && token[0] == '0') {
          return None
        }
        for ch in token.iter() {
          if ch < '0' || ch > '9' {
            return None
          }
          let digit = ch.to_int() - 48
          if index > (a.length() - digit) / 10 {
            return None
          }
          index = index * 10 + digit
        }
        if index >= a.length() {
          return None
        }
        selected = a[index]
      }
      _ => return None
    }
  }
  match selected {
    String(ip) => Some(ip)
    _ => None
  }
}

///|
#export_name("analysis_line")
#warnings("-deprecated")
pub fn analysis_line(handle : AnalysisHandle, text : String) -> String {
  if handle.error != "" {
    return handle.error
  }
  if handle.analyzer is Some(analyzer) {
    let ip = ip_from_json(
      @json.parse(text[:], max_nesting_depth=128),
      handle.tokens,
    ) catch {
      _ => None
    }
    try {
      match ip {
        Some(ip) => analyzer.push(ip)
        None => analyzer.invalid_input()
      }
    } catch {
      e => handle.error = e.to_json().stringify()
    }
  }
  handle.error
}

///|
#export_name("analysis_finish")
pub fn analysis_finish(handle : AnalysisHandle) -> String {
  if handle.error != "" {
    return handle.error
  }
  match handle.analyzer {
    Some(analyzer) =>
      analyzer.finish().to_json().stringify() catch {
        e => e.to_json().stringify()
      }
    None => "{\"status\":\"error\",\"code\":\"analyzer-closed\"}"
  }
}

///|
#export_name("analysis_close")
pub fn analysis_close(handle : AnalysisHandle) -> Unit {
  if handle.analyzer is Some(analyzer) {
    analyzer.close()
  }
  handle.analyzer = None
  handle.error = "{\"status\":\"error\",\"code\":\"analyzer-closed\"}"
}
