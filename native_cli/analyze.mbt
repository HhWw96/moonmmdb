///|
extern "C" fn host_raw_line(max_bytes : Int) -> Bytes = "mm_cli_raw_line"

///|
fn analysis_database(reader : @mmdb.Reader, bytes : Bytes) -> Json {
  let meta = reader.metadata()
  {
    "database_type": meta.database_type.to_json(),
    "build_epoch": meta.build_epoch.to_string().to_json(),
    "bytes": bytes.length().to_string().to_json(),
    "sha256": @crypto.bytes_to_hex_string(@crypto.sha256(bytes)).to_json(),
  }
}

///|
fn analyze_report(
  args : Array[String],
  expected? : Array[Json] = [],
) -> Json raise {
  if args.length() < 5 || args.length() % 2 != 1 {
    fail("host-input-error", "Expected CITY ASN INPUT and option/value pairs")
  }
  let mut ip_path = "/ip"
  let mut max_bytes = 8388608
  let mut max_line = 8388608
  let mut max_records = 10000
  let mut top = 10
  let mut max_groups = 10000
  let mut diagnostic_limit = 0
  let seen : Map[String, Bool] = Map([])
  for i = 5; i < args.length(); i = i + 2 {
    let flag = args[i]
    if seen.contains(flag) {
      fail("host-input-error", "Duplicate option: " + flag)
    }
    seen[flag] = true
    match flag {
      "--ip-path" => ip_path = args[i + 1]
      "--max-input-bytes" => max_bytes = positive(args[i + 1], 1073741824)
      "--max-line-bytes" => max_line = positive(args[i + 1], 8388608)
      "--max-records" => max_records = positive(args[i + 1], 1000000)
      "--diagnostic-limit" =>
        diagnostic_limit = if args[i + 1] == "0" {
          0
        } else {
          positive(args[i + 1], 1000)
        }
      "--top" => top = positive(args[i + 1], 100)
      "--max-groups" => max_groups = positive(args[i + 1], 10000)
      _ => fail("host-input-error", "Unknown option: " + flag)
    }
  }
  @mmdb.validate_paths([ip_path])
  let city_bytes = read_file(args[2], 268435456)
  let asn_bytes = read_file(args[3], 268435456 - city_bytes.length())
  let city = @mmdb.open_bytes(city_bytes)
  let asn = @mmdb.open_bytes(asn_bytes)
  let databases : Json = {
    "city": analysis_database(city, city_bytes),
    "asn": analysis_database(asn, asn_bytes),
  }
  for file in expected {
    let role = @workflow.str(@workflow.get(file, "role"))
    if role != "input" {
      verify_source(file, @workflow.get(databases, role))
    }
  }
  let session = @analytics_bridge.analysis_from_readers(
    city, asn, top, max_groups, ip_path,
  )
  let diagnostics = @analytics_bridge.DiagnosticBuffer::new(diagnostic_limit)
  fn check_analysis(text : String) -> Unit raise CliError {
    if text != "" {
      let value = object(parse(text, "analysis-error"), "analysis-error")
      fail(string(required(value, "code"), "analysis-error"), "Analysis failed")
    }
  }
  check_analysis(@analytics_bridge.analysis_error(session))
  defer @analytics_bridge.analysis_close(session)
  host_open(c_path(args[4]), max_bytes, max_line)
  check_io()
  defer host_close()
  let hash = @crypto.SHA256::new()
  let mut input_bytes : UInt64 = 0
  let mut rows = 0
  while true {
    let raw = host_raw_line(max_bytes)
    if host_error() == -1 {
      break
    }
    check_io(line=rows + 1)
    rows += 1
    if rows > max_records {
      fail("record-limit", "Input exceeds record limit", line=rows)
    }
    hash.update(raw)
    input_bytes += raw.length().to_uint64()
    let mut end = raw.length()
    if end > 0 && raw[end - 1] == b'\n' {
      end -= 1
    }
    if end > 0 && raw[end - 1] == b'\r' {
      end -= 1
    }
    let text = @utf8.decode(raw[:end]) catch {
      _ => raise CliError("invalid-utf8", "Input must be UTF-8", rows)
    }
    let text = if rows == 1 { strip_bom(text) } else { text }
    if diagnostic_limit > 0 {
      let outcome = @analytics_bridge.analysis_line_detailed(session, text)
      let value = parse(outcome, "analysis-error")
      if value is { "status": "error", .. } {
        check_analysis(outcome)
      }
      diagnostics.add(
        value,
        rows,
        input_bytes.to_int() - raw.length(),
        input_bytes.to_int(),
      )
    } else {
      check_analysis(@analytics_bridge.analysis_line(session, text))
    }
  }
  host_close()
  let result = object(
    parse(@analytics_bridge.analysis_finish(session), "analysis-error"),
    "analysis-error",
  )
  if result.get("status") == Some("error") {
    check_analysis(result.to_json().stringify())
  }
  result["tool_version"] = "0.9.3"
  result["parameters"] = {
    "ip_path": ip_path.to_json(),
    "top": top.to_json(),
    "max_groups": max_groups.to_json(),
    "max_records": max_records.to_json(),
    "max_input_bytes": max_bytes.to_json(),
    "max_line_bytes": max_line.to_json(),
    "max_json_depth": 128,
  }
  result["databases"] = databases
  result["input"] = {
    "bytes": input_bytes.to_string().to_json(),
    "sha256": @crypto.bytes_to_hex_string(hash.finalize()).to_json(),
  }
  if diagnostic_limit > 0 {
    result["diagnostics"] = diagnostics.to_json()
    let parameters = object(result["parameters"], "analysis-error")
    parameters["diagnostic_limit"] = diagnostic_limit.to_json()
  }
  result.to_json()
}

///|
fn analyze(args : Array[String]) -> Int raise {
  let result = analyze_report(args)
  emit(result)
  @workflow.integer(@workflow.get(result, "exit_code"), 0, 2)
}
