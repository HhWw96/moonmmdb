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
fn analyze(args : Array[String]) -> Int raise {
  if args.length() < 5 || args.length() % 2 != 1 {
    fail("host-input-error", "Expected CITY ASN INPUT and option/value pairs")
  }
  let mut ip_path = "/ip"
  let mut max_bytes = 8388608
  let mut max_line = 8388608
  let mut max_records = 10000
  let mut top = 10
  let mut max_groups = 10000
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
      "--top" => top = positive(args[i + 1], 100)
      "--max-groups" => max_groups = positive(args[i + 1], 10000)
      _ => fail("host-input-error", "Unknown option: " + flag)
    }
  }
  @mmdb.validate_paths([ip_path])
  let tokens = if ip_path == "" {
    []
  } else {
    ip_path[1:]
    .split("/")
    .map(fn(t) {
      t.to_owned().replace_all(old="~1", new="/").replace_all(old="~0", new="~")
    })
    .to_array()
  }
  let city_bytes = read_file(args[2], 268435456)
  let asn_bytes = read_file(args[3], 268435456 - city_bytes.length())
  let city = @mmdb.open_bytes(city_bytes)
  let asn = @mmdb.open_bytes(asn_bytes)
  let databases : Json = {
    "city": analysis_database(city, city_bytes),
    "asn": analysis_database(asn, asn_bytes),
  }
  let analyzer = @analytics.Analyzer::new(city, asn, limits={ top, max_groups, })
  host_open(c_path(args[4]), max_bytes, max_line)
  check_io()
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
    let ip = Some(select_ip(parse(text, "invalid-jsonl"), tokens)) catch {
      _ => None
    }
    match ip {
      Some(ip) => analyzer.push(ip)
      None => analyzer.invalid_input()
    }
  }
  host_close()
  let report = analyzer.finish()
  analyzer.close()
  let result = object(report.to_json(), "host-input-error")
  result["tool_version"] = "0.9.1"
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
  emit(result.to_json())
  report.exit_code
}
