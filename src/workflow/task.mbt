///|
pub suberror WorkflowError {
  WorkflowError(String)
}

///|
pub fn WorkflowError::to_json(self : WorkflowError) -> Json {
  let WorkflowError(message) = self
  {
    "status": "error",
    "code": "invalid-workflow",
    "message": message.to_json(),
  }
}

///|
fn reject(message : String) -> Unit raise WorkflowError {
  raise WorkflowError(message)
}

///|
pub fn obj(value : Json) -> Map[String, Json] raise WorkflowError {
  match value {
    Object(m) => m
    _ => {
      reject("Expected object")
      Map([])
    }
  }
}

///|
pub fn str(value : Json) -> String raise WorkflowError {
  match value {
    String(s) => s
    _ => {
      reject("Expected string")
      ""
    }
  }
}

///|
pub fn get(value : Json, key : String) -> Json raise WorkflowError {
  match obj(value).get(key) {
    Some(v) => v
    None => {
      reject("Missing " + key)
      null
    }
  }
}

///|
pub fn integer(
  value : Json,
  minimum : Int,
  maximum : Int,
) -> Int raise WorkflowError {
  match value {
    Number(n, ..) => {
      if n < minimum.to_double() ||
        n > maximum.to_double() ||
        n != n.to_int().to_double() {
        reject("Integer outside allowed range")
      }
      n.to_int()
    }
    _ => {
      reject("Expected integer")
      0
    }
  }
}

///|
fn keys(value : Json, allowed : Array[String]) -> Unit raise WorkflowError {
  for key, _ in obj(value) {
    if !allowed.contains(key) {
      reject("Unknown field: " + key)
    }
  }
}

///|
pub fn roles(operation : String) -> Array[String] raise WorkflowError {
  match operation {
    "lookup" | "validate" => ["database"]
    "compare" => ["before", "after"]
    "analyze" => ["city", "asn", "input"]
    _ => {
      reject("Unsupported task operation")
      []
    }
  }
}

///|
pub fn strings(value : Json) -> Array[String] raise WorkflowError {
  match value {
    Array(a) => a.map(v => str(v))
    _ => {
      reject("Expected string array")
      []
    }
  }
}

///|
pub fn decimal(value : Json) -> UInt64 raise WorkflowError {
  let s = str(value)
  if s.is_empty() || (s.length() > 1 && s[0] == '0') {
    reject("Expected canonical unsigned decimal string")
  }
  let mut n : UInt64 = 0
  for c in s.iter() {
    if c < '0' || c > '9' {
      reject("Invalid decimal counter")
    }
    let digit = (c.to_int() - 48).to_uint64()
    if n > (18446744073709551615 - digit) / 10 {
      reject("Counter exceeds UInt64")
    }
    n = n * 10 + digit
  }
  n
}

///|
pub fn check_hash(value : Json) -> Unit raise WorkflowError {
  let s = str(value)
  if s.length() != 64 {
    reject("Expected SHA-256")
  }
  for c in s.iter() {
    if !((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f')) {
      reject("Invalid SHA-256")
    }
  }
}

///|
#warnings("-deprecated")
pub fn parse_json(text : String, max_bytes : Int) -> Json raise WorkflowError {
  if @utf8.encode(text[:]).length() > max_bytes {
    reject("Document exceeds byte limit")
  }
  @json.parse(text[:], max_nesting_depth=128) catch {
    _ => {
      reject("Invalid JSON or depth exceeds 128")
      null
    }
  }
}

///|
pub fn check_task(task : Json) -> Json raise WorkflowError {
  keys(task, ["format", "version", "operation", "parameters", "files"])
  if get(task, "format") != "moonmmdb-task" || get(task, "version") != 1 {
    reject("Unsupported task format or version")
  }
  let operation = str(get(task, "operation"))
  let expected = roles(operation)
  let params = get(task, "parameters")
  let p = obj(params)
  match operation {
    "lookup" | "compare" => {
      keys(params, ["ip", "fields"])
      let ip = str(get(params, "ip"))
      if ip.length() > 256 {
        reject("IP exceeds input limit")
      }
      let fields = strings(get(params, "fields"))
      @mmdb.validate_paths(if fields.is_empty() { [""] } else { fields }) catch {
        _ => reject("Invalid field paths")
      }
    }
    "validate" => {
      keys(params, ["decode_data", "max_work", "max_state_bytes"])
      match get(params, "decode_data") {
        True | False => ()
        _ => reject("Expected decode_data boolean")
      }
      ignore(integer(get(params, "max_work"), 1, 1000000000))
      ignore(integer(get(params, "max_state_bytes"), 1, 268435456))
    }
    "analyze" => {
      keys(params, [
        "ip_path", "top", "max_groups", "max_records", "max_input_bytes", "max_line_bytes",
        "max_json_depth", "diagnostic_limit",
      ])
      @mmdb.validate_paths([str(get(params, "ip_path"))]) catch {
        _ => reject("Invalid input IP path")
      }
      for
        pair in [
          ("top", 100),
          ("max_groups", 10000),
          ("max_records", 1000000),
          ("max_input_bytes", 1073741824),
          ("max_line_bytes", 8388608),
        ] {
        let (name, cap) = pair
        ignore(integer(get(params, name), 1, cap))
      }
      if p.get("max_json_depth").unwrap_or(128) != 128 {
        reject("JSON depth must remain 128")
      }
      if p.get("diagnostic_limit") is Some(v) {
        ignore(integer(v, 0, 1000))
      }
    }
    _ => ()
  }
  let files = match get(task, "files") {
    Array(a) => a
    _ => {
      reject("Expected files array")
      []
    }
  }
  if files.length() != expected.length() {
    reject("Incorrect file role count")
  }
  let seen : Map[String, Bool] = Map([])
  for file in files {
    keys(file, ["role", "name", "bytes", "sha256"])
    let role = str(get(file, "role"))
    if !expected.contains(role) || seen.contains(role) {
      reject("Unknown or duplicate role")
    }
    seen[role] = true
    let name = str(get(file, "name"))
    if name.length() > 1024 ||
      name.contains("/") ||
      name.contains("\\") ||
      name.contains(":") ||
      name.contains("\u{0000}") {
      reject("Only a filename hint is allowed")
    }
    if obj(file).get("sha256") is Some(v) {
      check_hash(v)
    }
    if obj(file).get("bytes") is Some(v) {
      ignore(decimal(v))
    }
  }
  if @utf8.encode(task.stringify()[:]).length() > 65536 {
    reject("Task exceeds 64 KiB")
  }
  task
}

///|
#export_name("task_check")
pub fn task_check(text : String) -> String {
  check_task(parse_json(text, 65536)).stringify() catch {
    e => e.to_json().stringify()
  }
}
