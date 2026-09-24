///|
/// A projected record keeps an IP miss distinct from an absent field.
pub(all) struct Projection {
  record_found : Bool
  prefix_length : Int
  fields : Array[(String, Value?)]
} derive(Eq, @debug.Debug)

///|
fn pointer_tokens(pointer : String) -> Array[String] raise MmdbError {
  if pointer.length() > 2048 {
    raise MmdbError("path-limit", -1, "Pointer exceeds 2048 UTF-16 code units")
  }
  if pointer.is_empty() {
    return []
  }
  if pointer[0] != '/' {
    raise MmdbError(
      "invalid-path", -1, "JSON Pointer must be empty or start with slash",
    )
  }
  let tokens : Array[String] = []
  for part in pointer[1:].split("/") {
    if tokens.length() >= 128 {
      raise MmdbError("path-limit", -1, "Pointer exceeds 128 segments")
    }
    let out = StringBuilder()
    let mut escaped = false
    for ch in part {
      if escaped {
        match ch {
          '0' => out.write_char('~')
          '1' => out.write_char('/')
          _ =>
            raise MmdbError(
              "invalid-path", -1, "Only ~0 and ~1 escapes are allowed",
            )
        }
        escaped = false
      } else if ch == '~' {
        escaped = true
      } else {
        out.write_char(ch)
      }
    }
    if escaped {
      raise MmdbError("invalid-path", -1, "Incomplete tilde escape")
    }
    tokens.push(out.to_string())
  }
  tokens
}

///|
fn select_tokens(value : Value, tokens : Array[String]) -> Value? {
  let mut current = value
  for token in tokens {
    match current {
      Object(_) =>
        match current.get(token) {
          Some(next) => current = next
          None => return None
        }
      List(items) => {
        if token.is_empty() || (token.length() > 1 && token[0] == '0') {
          return None
        }
        let mut index = 0
        for ch in token {
          if ch < '0' || ch > '9' {
            return None
          }
          // Reject before multiplication can overflow, even on huge index tokens.
          if index > items.length() / 10 {
            return None
          }
          index = index * 10 + ch.to_int() - 48
          if index >= items.length() {
            return None
          }
        }
        if index >= items.length() {
          return None
        }
        current = items[index]
      }
      _ => return None
    }
  }
  Some(current)
}

///|
/// RFC 6901 string form: empty selects root; ~0 is tilde and ~1 is slash.
/// Absent keys, out-of-range/noncanonical array indexes and scalar children are None.
pub fn Value::at_pointer(
  self : Value,
  pointer : String,
) -> Value? raise MmdbError {
  select_tokens(self, pointer_tokens(pointer))
}

///|
priv struct SelectionBudget {
  mut values : Int
  mut payload : Int
}

///|
fn charge_selection(
  value : Value,
  budget : SelectionBudget,
) -> Unit raise MmdbError {
  if budget.values <= 0 {
    raise MmdbError("value-limit", -1, "Projected values budget exhausted")
  }
  budget.values = budget.values - 1
  let bytes = match value {
    Text(text) => {
      // Decoded strings are valid Unicode. Count the identical UTF-8 payload
      // without allocating a second byte buffer just to measure its length.
      let mut size = 0
      for ch in text.iter() {
        let n = ch.to_int()
        size += if n < 0x80 {
          1
        } else if n < 0x800 {
          2
        } else if n < 0x10000 {
          3
        } else {
          4
        }
      }
      size
    }
    Blob(bytes) => bytes.length()
    List(items) => {
      for item in items {
        charge_selection(item, budget)
      }
      0
    }
    Object(items) => {
      for item in items {
        charge_selection(Text(item.0), budget)
        charge_selection(item.1, budget)
      }
      0
    }
    _ => 0
  }
  if bytes > budget.payload {
    raise MmdbError("payload-limit", -1, "Projected payload budget exhausted")
  }
  budget.payload = budget.payload - bytes
}

///|
fn projection_paths(
  paths : Array[String],
) -> Array[Array[String]] raise MmdbError {
  if paths.is_empty() || paths.length() > 64 {
    raise MmdbError("path-limit", -1, "Expected 1 to 64 field paths")
  }
  let parsed : Array[Array[String]] = []
  let seen : Map[String, Bool] = Map([])
  for path in paths {
    if seen.contains(path) {
      raise MmdbError("invalid-path", -1, "Duplicate field path")
    }
    seen[path] = true
    parsed.push(pointer_tokens(path))
  }
  parsed
}

///|
/// Validate a projection configuration even before any records arrive.
pub fn validate_paths(paths : Array[String]) -> Unit raise MmdbError {
  ignore(projection_paths(paths))
}

///|
/// Opaque, reusable selection configuration, independent of a database or result.
pub struct FieldSelector {
  priv paths : Array[String]
  priv tokens : Array[Array[String]]
}

///|
/// Parse and validate once; snapshot the caller's array for stable reuse.
pub fn prepare_fields(paths : Array[String]) -> FieldSelector raise MmdbError {
  let tokens = projection_paths(paths)
  { paths: paths.map(path => path), tokens, }
}

///|
/// Decode once under the normal per-record budget, then select 1..64 paths.
/// This is projection of a validated record, not lazy or partial decoding.
pub fn Reader::project(
  self : Reader,
  ip : String,
  paths : Array[String],
) -> Projection raise MmdbError {
  self.project_prepared(ip, prepare_fields(paths))
}

///|
/// Reuse validated paths; decoding and selection budgets reset for every call.
pub fn Reader::project_prepared(
  self : Reader,
  ip : String,
  selector : FieldSelector,
) -> Projection raise MmdbError {
  let paths = selector.paths
  let parsed = selector.tokens
  let record = self.lookup(ip)
  // Charge repeated selections too; overlapping paths cannot multiply output freely.
  let budget = {
    values: self.limits.max_values,
    payload: self.limits.max_payload_bytes,
  }
  let fields : Array[(String, Value?)] = []
  for i in 0..<paths.length() {
    let value = match record.value {
      Some(value) => select_tokens(value, parsed[i])
      None => None
    }
    if value is Some(selected) {
      charge_selection(selected, budget)
    }
    fields.push((paths[i], value))
  }
  {
    record_found: record.value is Some(_),
    prefix_length: record.prefix_length,
    fields,
  }
}

///|
pub fn Projection::to_json(self : Projection) -> Json {
  let fields : Map[String, Json] = Map([])
  for field in self.fields {
    let (path, value) = field
    fields[path] = match value {
      Some(value) => { "status": "present", "value": value.to_tagged_json() }
      None => { "status": "missing" }
    }
  }
  {
    "status": (if self.record_found { "found" } else { "not_found" }).to_json(),
    "prefix_length": self.prefix_length.to_json(),
    "fields": fields.to_json(),
  }
}
