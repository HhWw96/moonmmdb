///|
fn sum(a : UInt64, b : UInt64) -> UInt64 raise WorkflowError {
  if a > 18446744073709551615 - b {
    reject("Counter sum overflow")
  }
  a + b
}

///|
fn array(value : Json) -> Array[Json] raise WorkflowError {
  match value {
    Array(a) => a
    _ => {
      reject("Expected array")
      []
    }
  }
}

///|
fn check_dimension(
  d : Json,
  valid : UInt64,
  parameters : Json,
) -> Unit raise WorkflowError {
  let mut total : UInt64 = 0
  for
    name in [
      "counted", "not_found", "missing_field", "type_error", "query_error",
    ] {
    total = sum(total, decimal(get(d, name)))
  }
  if total != valid {
    reject("Dimension totals do not equal valid_ips")
  }
  let groups = decimal(get(d, "group_count"))
  let counted = decimal(get(d, "counted"))
  let rows = array(get(d, "top"))
  let top = integer(get(parameters, "top"), 1, 100)
  let max_groups = integer(get(parameters, "max_groups"), 1, 10000)
  if rows.length() !=
    (if groups < top.to_uint64() { groups.to_int() } else { top }) ||
    groups > max_groups.to_uint64() ||
    groups > counted {
    reject("Invalid group count or top length")
  }
  let seen : Map[String, Bool] = Map([])
  let mut previous : (UInt64, String)? = None
  let mut selected : UInt64 = 0
  for row in rows {
    let key = str(get(row, "key"))
    let count = decimal(get(row, "count"))
    if seen.contains(key) || count == 0 || @utf8.encode(key[:]).length() > 256 {
      reject("Invalid ranking entry")
    }
    seen[key] = true
    if previous is Some((n, k)) {
      if count > n || (count == n && k.lexical_compare(key) >= 0) {
        reject("Invalid ranking order")
      }
    }
    previous = Some((count, key))
    selected = sum(selected, count)
  }
  let other = decimal(get(d, "other_requests"))
  if (groups == 0) != (counted == 0) ||
    (groups <= rows.length().to_uint64() && other != 0) {
    reject("Groups do not account for counted requests")
  }
  if previous is Some((last_count, _)) {
    let remainder = groups - rows.length().to_uint64()
    // Counts cannot exceed the already checked one-million input record cap.
    if remainder > 0 && other / remainder > last_count {
      reject("Other groups exceed top ranking")
    }
    if remainder > 0 &&
      other / remainder == last_count &&
      other % remainder != 0 {
      reject("Other groups exceed top ranking")
    }
  }
  if sum(selected, other) != counted ||
    other < groups - rows.length().to_uint64() {
    reject("Invalid other_requests")
  }
}

///|
fn check_analytics(result : Json) -> Unit raise WorkflowError {
  if get(result, "status") != "complete" {
    reject("Incomplete analysis is not a completed report")
  }
  let requests = decimal(get(result, "requests"))
  let valid = decimal(get(result, "valid_ips"))
  let invalid = decimal(get(result, "invalid_inputs"))
  if sum(valid, invalid) != requests {
    reject("Input totals do not agree")
  }
  let p = get(result, "parameters")
  if requests > integer(get(p, "max_records"), 1, 1000000).to_uint64() {
    reject("Report exceeds record budget")
  }
  let mut code = if invalid > 0 { 2 } else { 0 }
  for name in ["country", "asn"] {
    let d = get(result, name)
    check_dimension(d, valid, p)
    if decimal(get(d, "not_found")) > 0 {
      code = code.max(1)
    }
    if decimal(get(d, "type_error")) > 0 || decimal(get(d, "query_error")) > 0 {
      code = 2
    }
  }
  if get(result, "exit_code") != code.to_json() {
    reject("Exit code contradicts counters")
  }
  let input = get(result, "input")
  check_hash(get(input, "sha256"))
  let bytes = decimal(get(input, "bytes"))
  if bytes > integer(get(p, "max_input_bytes"), 1, 1073741824).to_uint64() {
    reject("Report exceeds byte budget")
  }
  if obj(result).get("diagnostics") is Some(d) {
    let rows = array(get(d, "rows"))
    if rows.length() > integer(get(d, "limit"), 0, 1000) ||
      decimal(get(d, "retained")) != rows.length().to_uint64() {
      reject("Invalid diagnostic length")
    }
    if sum(decimal(get(d, "retained")), decimal(get(d, "omitted"))) > requests {
      reject("Invalid diagnostic totals")
    }
    let total_diagnostics = sum(
      decimal(get(d, "retained")),
      decimal(get(d, "omitted")),
    )
    let country_bad = valid - decimal(get(get(result, "country"), "counted"))
    let asn_bad = valid - decimal(get(get(result, "asn"), "counted"))
    let lower = sum(
      invalid,
      if country_bad > asn_bad {
        country_bad
      } else {
        asn_bad
      },
    )
    let upper = sum(
      invalid,
      if country_bad > valid - asn_bad {
        valid
      } else {
        country_bad + asn_bad
      },
    )
    if total_diagnostics < lower || total_diagnostics > upper {
      reject("Diagnostic total contradicts anomaly counters")
    }
    let observed : Map[String, UInt64] = Map([])
    let mut observed_invalid : UInt64 = 0
    let mut last_line : UInt64 = 0
    let mut last_end : UInt64 = 0
    let mut diagnostic_bytes = 0
    for row in rows {
      keys(row, ["line", "start", "end", "outcome"])
      let line = decimal(get(row, "line"))
      let start = decimal(get(row, "start"))
      let end = decimal(get(row, "end"))
      if line <= last_line ||
        line > requests ||
        start < last_end ||
        end <= start ||
        end > bytes ||
        end - start > 8388609 {
        reject("Invalid diagnostic byte range")
      }
      let outcome = get(row, "outcome")
      keys(outcome, ["input", "issues"])
      let input = str(get(outcome, "input"))
      if ![
          "valid", "invalid-jsonl", "missing-ip", "ip-type-error", "invalid-ip",
        ].contains(input) {
        reject("Invalid diagnostic category")
      }
      let issues = array(get(outcome, "issues"))
      if issues.length() > 2 ||
        (input == "valid" && issues.is_empty()) ||
        (input != "valid" && !issues.is_empty()) {
        reject("Invalid diagnostic outcome")
      }
      let dimensions : Map[String, Bool] = Map([])
      for issue in issues {
        keys(issue, ["dimension", "category", "code", "database_offset"])
        let dimension = str(get(issue, "dimension"))
        if !["country", "asn"].contains(dimension) ||
          dimensions.contains(dimension) {
          reject("Invalid diagnostic dimension")
        }
        dimensions[dimension] = true
        let category = str(get(issue, "category"))
        if !["not_found", "missing_field", "type_error", "query_error"].contains(
            category,
          ) {
          reject("Invalid source category")
        }
        let key = dimension + ":" + category
        let count = observed.get(key).unwrap_or(0) + 1
        observed[key] = count
        if count > decimal(get(get(result, dimension), category)) {
          reject("Diagnostic contradicts dimension counters")
        }
        if category == "query_error" {
          if str(get(issue, "code")).length() > 128 {
            reject("Diagnostic code too long")
          }
          ignore(integer(get(issue, "database_offset"), -1, 536870912))
        }
      }
      if input != "valid" {
        observed_invalid += 1
      }
      if observed_invalid > invalid {
        reject("Diagnostic contradicts invalid_inputs")
      }
      diagnostic_bytes += @utf8.encode(row.stringify()[:]).length()
      if diagnostic_bytes > 524288 {
        reject("Diagnostics exceed 512 KiB")
      }
      last_line = line
      last_end = end
    }
    let remaining : Array[UInt64] = []
    for dimension in ["country", "asn"] {
      let mut n : UInt64 = 0
      for
        category in ["not_found", "missing_field", "type_error", "query_error"] {
        n += decimal(get(get(result, dimension), category)) -
          observed.get(dimension + ":" + category).unwrap_or(0)
      }
      remaining.push(n)
    }
    let invalid_left = invalid - observed_invalid
    let omitted = decimal(get(d, "omitted"))
    if omitted <
      invalid_left +
      (if remaining[0] > remaining[1] { remaining[0] } else { remaining[1] }) ||
      omitted > invalid_left + remaining[0] + remaining[1] {
      reject("Omitted diagnostic count contradicts remaining anomalies")
    }
  }
}

///|
fn file_ref(
  role : String,
  source : Json,
  name : String,
) -> Json raise WorkflowError {
  let hash = get(source, "sha256")
  check_hash(hash)
  let bytes = get(source, "bytes")
  let size = match bytes {
    String(_) => decimal(bytes)
    _ => integer(bytes, 0, 1073741824).to_uint64()
  }
  {
    "role": role.to_json(),
    "name": name.to_json(),
    "sha256": hash,
    "bytes": size.to_string().to_json(),
  }
}

///|
fn legacy_task(report : Json, result : Json) -> Json raise WorkflowError {
  if obj(result).get("status") == Some("complete") {
    let dbs = get(result, "databases")
    return {
      "format": "moonmmdb-task",
      "version": 1,
      "operation": "analyze",
      "parameters": get(result, "parameters"),
      "files": [
        file_ref("city", get(dbs, "city"), "city.mmdb"),
        file_ref("asn", get(dbs, "asn"), "asn.mmdb"),
        file_ref("input", get(result, "input"), "input.jsonl"),
      ],
    }
  }
  let operation = get(report, "operation")
  let op = str(get(operation, "op"))
  let params : Json = if op == "validate" {
    {
      "decode_data": get(operation, "decode"),
      "max_work": get(operation, "work"),
      "max_state_bytes": get(operation, "state"),
    }
  } else {
    { "ip": get(operation, "ip"), "fields": get(operation, "fields") }
  }
  let dbs = array(get(report, "databases"))
  let expected = roles(op)
  if dbs.length() < expected.length() {
    reject("Report lacks database provenance")
  }
  let files : Array[Json] = []
  for i in 0..<expected.length() {
    files.push(file_ref(expected[i], dbs[i], "database.mmdb"))
  }
  {
    "format": "moonmmdb-task",
    "version": 1,
    "operation": op.to_json(),
    "parameters": params,
    "files": files.to_json(),
  }
}

///|
fn tagged(value : Json) -> Unit raise WorkflowError {
  let kind = str(get(value, "type"))
  let data = get(value, "value")
  match kind {
    "map" =>
      for _, child in obj(data) {
        tagged(child)
      }
    "array" =>
      for child in array(data) {
        tagged(child)
      }
    "string" => ignore(str(data))
    "bool" | "boolean" =>
      match data {
        True | False => ()
        _ => reject("Invalid boolean value")
      }
    "bytes" => {
      let s = str(data)
      if s.length() % 2 != 0 {
        reject("Invalid bytes")
      }
      for c in s.iter() {
        if !((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f')) {
          reject("Invalid bytes")
        }
      }
    }
    "uint16" | "uint32" | "uint64" => {
      let n = decimal(data)
      if (kind == "uint16" && n > 65535) || (kind == "uint32" && n > 4294967295) {
        reject("Integer out of range")
      }
    }
    "uint128" => {
      let s = str(data)
      if s.is_empty() ||
        (s.length() > 1 && s[0] == '0') ||
        s.length() > 39 ||
        (
          s.length() == 39 &&
          s.lexical_compare("340282366920938463463374607431768211455") > 0
        ) {
        reject("Invalid uint128")
      }
      for c in s.iter() {
        if c < '0' || c > '9' {
          reject("Invalid uint128")
        }
      }
    }
    "int32" => {
      let s = str(data)
      let negative = s.has_prefix("-")
      let magnitude = decimal(
        (if negative { s[1:].to_owned() } else { s }).to_json(),
      )
      if magnitude > (if negative { 2147483648 } else { 2147483647 }) {
        reject("Invalid int32")
      }
    }
    "float32" | "float64" => {
      ignore(str(data))
      let bits = str(get(value, "bits"))
      if bits.is_empty() ||
        bits.length() > (if kind == "float32" { 8 } else { 16 }) {
        reject("Invalid floating point bits")
      }
      for c in bits.iter() {
        if !((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f')) {
          reject("Invalid float bits")
        }
      }
    }
    _ => reject("Unknown tagged value type")
  }
}

///|
fn query_result(result : Json) -> Unit raise WorkflowError {
  let status = str(get(result, "status"))
  if status == "error" {
    ignore(str(get(result, "code")))
    return
  }
  if !["found", "not_found"].contains(status) {
    reject("Invalid query status")
  }
  ignore(integer(get(result, "prefix_length"), 0, 128))
  if obj(result).get("record") is Some(record) {
    if status == "found" {
      tagged(record)
    } else if record != null {
      reject("Miss has a record")
    }
  } else if obj(result).get("fields") is Some(fields) {
    for _, field in obj(fields) {
      match get(field, "status") {
        "present" => tagged(get(field, "value"))
        "missing" => ()
        _ => reject("Invalid field status")
      }
    }
  } else {
    reject("Query lacks record or fields")
  }
}

///|
fn check_fields(
  result : Json,
  paths : Array[String],
  projected : Bool,
) -> Unit raise WorkflowError {
  if get(result, "status") == "error" {
    return
  }
  if !projected && paths.is_empty() {
    if !obj(result).contains("record") {
      reject("Full lookup requires a record")
    }
    return
  }
  let paths = if paths.is_empty() { [""] } else { paths }
  let fields = obj(get(result, "fields"))
  if fields.length() != paths.length() || !paths.all(p => fields.contains(p)) {
    reject("Projected fields differ from task")
  }
  if get(result, "status") == "not_found" {
    for _, field in fields {
      if get(field, "status") != "missing" {
        reject("Miss cannot contain present fields")
      }
    }
  }
}

///|
pub fn check_report(report : Json) -> Json raise WorkflowError {
  let outer = obj(report)
  if outer.get("format") is Some(format) && format != "moonmmdb-report" {
    reject("Unsupported report format")
  }
  let result = outer.get("result").unwrap_or(report)
  if outer.contains("result") && get(report, "version") != 1 {
    reject("Unsupported report version")
  }
  let task = check_task(
    outer.get("task").unwrap_or_else(() => legacy_task(report, result)),
  )
  let operation = str(get(task, "operation"))
  match operation {
    "analyze" => {
      check_analytics(result)
      if get(task, "parameters") != get(result, "parameters") {
        reject("Task and analysis parameters differ")
      }
      let derived = legacy_task(report, result)
      let actual = array(get(derived, "files"))
      for file in array(get(task, "files")) {
        for source in actual {
          if get(file, "role") == get(source, "role") {
            if get(file, "sha256") != get(source, "sha256") ||
              get(file, "bytes") != get(source, "bytes") {
              reject("Conflicting source provenance")
            }
          }
        }
      }
    }
    "lookup" => {
      query_result(result)
      check_fields(
        result,
        strings(get(get(task, "parameters"), "fields")),
        false,
      )
    }
    "compare" => {
      if !["changed", "unchanged", "error"].contains(str(get(result, "status"))) {
        reject("Invalid comparison status")
      }
      if get(result, "status") != "error" {
        ignore(strings(get(result, "changed_fields")))
        let before = get(result, "before")
        let after = get(result, "after")
        query_result(before)
        query_result(after)
        let selected_paths = strings(get(get(task, "parameters"), "fields"))
        check_fields(before, selected_paths, true)
        check_fields(after, selected_paths, true)
        let record_changed = get(before, "status") != get(after, "status")
        let prefix_changed = get(before, "prefix_length") !=
          get(after, "prefix_length")
        if get(result, "record_changed") != record_changed.to_json() ||
          get(result, "prefix_changed") != prefix_changed.to_json() {
          reject("Comparison flags contradict records")
        }
        let paths = strings(get(get(task, "parameters"), "fields"))
        let paths = if paths.is_empty() { [""] } else { paths }
        let changed : Array[String] = []
        for path in paths {
          if get(get(before, "fields"), path) != get(get(after, "fields"), path) {
            changed.push(path)
          }
        }
        if get(result, "changed_fields") != changed.to_json() {
          reject("Changed fields contradict values")
        }
        let status : Json = if record_changed ||
          prefix_changed ||
          !changed.is_empty() {
          "changed"
        } else {
          "unchanged"
        }
        if get(result, "status") != status {
          reject("Comparison status contradicts changes")
        }
      }
    }
    "validate" => {
      let status = str(get(result, "status"))
      if !["valid", "invalid", "incomplete", "error"].contains(status) {
        reject("Invalid validation status")
      }
      if status == "valid" {
        for
          name in [
            "checked_nodes", "reachable_nodes", "unreachable_nodes", "decoded_records",
            "work_used",
          ] {
          ignore(integer(get(result, name), 0, 1000000000))
        }
        let params = get(task, "parameters")
        let scope : Json = if get(params, "decode_data") == true {
          "all-tree-nodes-and-referenced-records"
        } else {
          "all-tree-nodes"
        }
        if get(result, "scope") != scope {
          reject("Validation scope differs from task")
        }
        let checked = integer(get(result, "checked_nodes"), 0, 1000000000)
        let reachable = integer(get(result, "reachable_nodes"), 0, 1000000000)
        let unreachable_count = integer(
          get(result, "unreachable_nodes"),
          0,
          1000000000,
        )
        if reachable + unreachable_count != checked {
          reject("Node counts do not agree")
        }
        if integer(get(result, "work_used"), 0, 1000000000) >
          integer(get(params, "max_work"), 1, 1000000000) ||
          integer(get(result, "peak_state_bytes"), 0, 268435456) >
          integer(get(params, "max_state_bytes"), 1, 268435456) {
          reject("Validation exceeds budget")
        }
      } else {
        ignore(str(get(result, "code")))
      }
    }
    _ => ()
  }
  for file in array(get(task, "files")) {
    check_hash(get(file, "sha256"))
    ignore(decimal(get(file, "bytes")))
  }
  {
    "status": "checked",
    "level": "internal",
    "recomputed": false,
    "task": task,
    "result": result,
  }
}

///|
#export_name("report_check")
pub fn report_check(text : String) -> String {
  check_report(parse_json(text, 8388608)).stringify() catch {
    e => e.to_json().stringify()
  }
}

///|
fn semantic(value : Json) -> Json {
  match value {
    Object(m) => {
      let out : Map[String, Json] = Map([])
      for key, v in m {
        if !["tool_version", "finished", "elapsed_ms"].contains(key) {
          out[key] = v
        }
      }
      out.to_json()
    }
    _ => value
  }
}

///|
#export_name("report_compare")
pub fn report_compare(expected : String, actual : String) -> String {
  try {
    let left = check_report(parse_json(expected, 8388608))
    let right = check_report(parse_json(actual, 8388608))
    let a = semantic(get(left, "result"))
    let b = semantic(get(right, "result"))
    if !obj(a).contains("diagnostics") {
      ignore(obj(b).remove("diagnostics"))
    }
    let left_files = array(get(get(left, "task"), "files"))
    let right_files = array(get(get(right, "task"), "files"))
    let same_sources = left_files.all(f => {
      right_files.any(g => {
        get(f, "role") == get(g, "role") &&
        get(f, "sha256") == get(g, "sha256") &&
        get(f, "bytes") == get(g, "bytes")
      })
    })
    let same = same_sources &&
      a == b &&
      get(get(left, "task"), "operation") ==
      get(get(right, "task"), "operation") &&
      get(get(left, "task"), "parameters") ==
      get(get(right, "task"), "parameters")
    let response : Json = {
      "status": if same {
        "consistent"
      } else {
        "different"
      },
      "level": "recomputed",
      "recomputed": true,
      "exit_code": if same {
        0
      } else {
        1
      },
    }
    response.stringify()
  } catch {
    e => e.to_json().stringify()
  }
}
