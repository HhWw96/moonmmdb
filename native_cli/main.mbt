///|
suberror CliError {
  CliError(String, String, Int)
}

///|
extern "C" fn host_init() -> Unit = "mm_cli_init"

///|
#borrow(fallback)
extern "C" fn host_arg(index : Int, fallback : String) -> String = "mm_cli_arg"

///|
#borrow(path)
extern "C" fn host_read(path : Bytes, limit : Int) -> Bytes = "mm_cli_read"

///|
#borrow(config, database)
extern "C" fn host_resolve(config : Bytes, database : Bytes) -> Bytes = "mm_cli_resolve"

///|
extern "C" fn host_error() -> Int = "mm_cli_error"

///|
#borrow(path)
extern "C" fn host_open(path : Bytes, max_bytes : Int, max_line : Int) -> Unit = "mm_cli_open"

///|
extern "C" fn host_line(max_bytes : Int) -> Bytes = "mm_cli_line"

///|
extern "C" fn host_close() -> Unit = "mm_cli_close"

///|
#borrow(bytes)
extern "C" fn host_write(bytes : Bytes, length : Int, channel : Int) -> Int = "mm_cli_write"

///|
extern "C" fn exit_process(code : Int) -> Unit = "exit"

///|
fn fail(
  code : String,
  message : String,
  line? : Int = 0,
) -> Unit raise CliError {
  raise CliError(code, message, line)
}

///|
fn c_path(path : String) -> Bytes raise CliError {
  if path.contains("\u{0000}") {
    fail("host-input-error", "Path contains NUL")
  }
  @utf8.encode((path + "\u{0000}")[:])
}

///|
fn write(text : String, channel? : Int = 0) -> Unit raise CliError {
  let bytes = @utf8.encode(text[:])
  if host_write(bytes, bytes.length(), channel) != 0 {
    fail("host-output-error", "Cannot write output")
  }
}

///|
fn emit(value : Json, channel? : Int = 0) -> Unit raise CliError {
  write(value.stringify() + "\n", channel~)
}

///|
fn check_io(line? : Int = 0) -> Unit raise CliError {
  let code = host_error()
  if code != 0 {
    fail(
      match code {
        2 => "file-limit"
        3 => "input-limit"
        4 => "line-limit"
        _ => "host-input-error"
      },
      "Cannot read input or configured limit exceeded",
      line~,
    )
  }
}

///|
fn read_file(path : String, limit : Int) -> Bytes raise CliError {
  let bytes = host_read(c_path(path), limit)
  check_io()
  bytes
}

///|
fn decode(bytes : Bytes, line? : Int = 0) -> String raise CliError {
  @utf8.decode(bytes[:]) catch {
    _ => raise CliError("invalid-utf8", "Input must be UTF-8", line)
  }
}

///|
fn strip_bom(text : String) -> String {
  if text.length() > 0 && text[0] == '\u{feff}' {
    text[1:].to_owned()
  } else {
    text
  }
}

///|
#warnings("-deprecated")
fn parse(text : String, code : String) -> Json raise CliError {
  @json.parse(text[:], max_nesting_depth=128) catch {
    _ => raise CliError(code, "Invalid JSON or nesting exceeds 128", 0)
  }
}

///|
fn object(value : Json, code : String) -> Map[String, Json] raise CliError {
  match value {
    Object(m) => m
    _ => raise CliError(code, "Expected an object", 0)
  }
}

///|
fn string(value : Json, code : String) -> String raise CliError {
  match value {
    String(s) => s
    _ => raise CliError(code, "Expected a string", 0)
  }
}

///|
fn required(value : Map[String, Json], name : String) -> Json raise CliError {
  match value.get(name) {
    Some(v) => v
    None => raise CliError("invalid-config", "Missing field: " + name, 0)
  }
}

///|
fn strings(value : Json) -> Array[String] raise CliError {
  match value {
    Array(a) => {
      let out = []
      for item in a {
        out.push(string(item, "invalid-config"))
      }
      out
    }
    _ => raise CliError("invalid-config", "Expected fields array", 0)
  }
}

///|
fn positive(text : String, limit : Int) -> Int raise CliError {
  if text.is_empty() || text[0] < '1' || text[0] > '9' {
    fail("host-input-error", "Expected a positive decimal integer")
  }
  let mut n = 0
  for ch in text.iter() {
    if ch < '0' || ch > '9' {
      fail("host-input-error", "Expected a positive decimal integer")
    }
    let digit = ch.to_int() - 48
    if n > (limit - digit) / 10 {
      fail("host-input-error", "Option exceeds its maximum")
    }
    n = n * 10 + digit
  }
  if n > limit {
    fail("host-input-error", "Option exceeds its maximum")
  }
  n
}

///|
fn select_ip(row : Json, tokens : Array[String]) -> String raise CliError {
  ignore(object(row, "invalid-jsonl"))
  let mut value = row
  for token in tokens {
    value = match value {
      Object(m) =>
        match m.get(token) {
          Some(v) => v
          None => raise CliError("invalid-jsonl", "IP field missing", 0)
        }
      Array(a) => {
        let index = if token == "0" {
          0
        } else {
          positive(token, 1073741824) catch {
            _ => raise CliError("invalid-jsonl", "Invalid array index", 0)
          }
        }
        if index >= a.length() {
          fail("invalid-jsonl", "Array index missing")
        }
        a[index]
      }
      _ => raise CliError("invalid-jsonl", "IP field missing", 0)
    }
  }
  string(value, "invalid-jsonl")
}

///|
struct SourceStats {
  provenance : Map[String, Json]
  mut found : Int
  mut not_found : Int
  mut errors : Int
  mut missing_fields : Int
}

///|
fn load_many(
  config_path : String,
) -> (@mmdb.Enricher, Map[String, SourceStats]) raise {
  let config = object(
    parse(strip_bom(decode(read_file(config_path, 65536))), "invalid-config"),
    "invalid-config",
  ) catch {
    _ => raise CliError("invalid-config", "Cannot read valid configuration", 0)
  }
  if config.length() != 2 || required(config, "version") != (1).to_json() {
    fail("invalid-config", "Expected version 1 and sources")
  }
  let items = match required(config, "sources") {
    Array(a) => a
    _ => raise CliError("invalid-config", "Expected sources array", 0)
  }
  if items.length() < 1 || items.length() > 4 {
    fail("invalid-config", "Expected one to four sources")
  }
  let validated : Array[(String, String, Array[String], @mmdb.FieldSelector)] = []
  let names : Map[String, Bool] = Map([])
  for item in items {
    let entry = object(item, "invalid-config")
    if entry.length() != 3 {
      fail("invalid-config", "Unexpected source fields")
    }
    let name = string(required(entry, "name"), "invalid-config")
    if name.length() < 1 || name.length() > 32 || names.contains(name) {
      fail("invalid-config", "Invalid or duplicate source name")
    }
    for i in 0..<name.length() {
      let ch = name[i]
      let letter = (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z')
      if !letter &&
        (i == 0 || !((ch >= '0' && ch <= '9') || ch == '_' || ch == '-')) {
        fail("invalid-config", "Invalid source name")
      }
    }
    names[name] = true
    let database = string(required(entry, "database"), "invalid-config")
    if database.is_empty() || database.contains("\u{0000}") {
      fail("invalid-config", "Invalid database path")
    }
    let fields = strings(required(entry, "fields"))
    let selector = @mmdb.prepare_fields(fields)
    validated.push((name, database, fields, selector))
  }
  let mut total = 0
  let sources : Array[@mmdb.EnrichmentSource] = []
  let stats : Map[String, SourceStats] = Map([])
  for entry in validated {
    let (name, database, fields, selector) = entry
    let resolved = host_resolve(c_path(config_path), c_path(database))
    check_io()
    let bytes = read_file(decode(resolved), 268435456 - total)
    total += bytes.length()
    let reader = @mmdb.open_bytes(bytes)
    let metadata = reader.metadata()
    let provenance : Map[String, Json] = Map([
      ("name", name.to_json()),
      ("bytes", bytes.length().to_json()),
      ("sha256", @crypto.bytes_to_hex_string(@crypto.sha256(bytes)).to_json()),
      ("database_type", metadata.database_type.to_json()),
      ("build_epoch", metadata.build_epoch.to_string().to_json()),
      ("fields", fields.to_json()),
    ])
    stats[name] = {
      provenance,
      found: 0,
      not_found: 0,
      errors: 0,
      missing_fields: 0,
    }
    sources.push({ name, reader, fields: selector, })
  }
  (@mmdb.Enricher::new(sources), stats)
}

///|
fn enrich_many(args : Array[String]) -> Int raise {
  if args.length() < 4 || args.length() % 2 != 0 {
    fail("invalid-config", "Expected CONFIG INPUT and option/value pairs")
  }
  let mut ip_path = "/ip"
  let mut max_bytes = 8388608
  let mut max_line = 8388608
  let mut max_records = 10000
  let seen : Map[String, Bool] = Map([])
  for i = 4; i < args.length(); i = i + 2 {
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
      "--field" =>
        fail("invalid-config", "enrich-many reads fields from configuration")
      _ => fail("host-input-error", "Unknown option: " + flag)
    }
  }
  @mmdb.validate_paths([ip_path])
  let tokens = if ip_path == "" {
    []
  } else {
    ip_path[1:]
    .split("/")
    .map(t => {
      t.to_owned().replace_all(old="~1", new="/").replace_all(old="~0", new="~")
    })
    .to_array()
  }
  let (enricher, stats) = load_many(args[2])
  host_open(c_path(args[3]), max_bytes, max_line)
  check_io()
  let mut processed = 0
  let mut valid = 0
  let mut invalid = 0
  let mut code = 0
  while true {
    let bytes = host_line(max_bytes)
    if host_error() == -1 {
      break
    }
    check_io(line=processed + 1)
    processed += 1
    if processed > max_records {
      fail("record-limit", "JSONL exceeds record limit", line=processed)
    }
    let text = decode(bytes, line=processed)
    let text = if processed == 1 { strip_bom(text) } else { text }
    let ip = select_ip(parse(text, "invalid-jsonl"), tokens) catch {
      _ => {
        invalid += 1
        code = 2
        emit({
          "line": processed.to_json(),
          "status": "error",
          "code": "invalid-jsonl",
          "message": "Expected JSON object with IP string; nesting limit 128",
        })
        continue
      }
    }
    let result = try {
      let enriched = enricher.lookup(ip)
      valid += 1
      code = code.max(enriched.status_code())
      for entry in enriched.sources {
        let (name, result) = entry
        let state = stats[name]
        match result {
          Failed(_) => state.errors += 1
          Selected(p) => {
            if p.record_found {
              state.found += 1
            } else {
              state.not_found += 1
            }
            for field in p.fields {
              if field.1 is None {
                state.missing_fields += 1
              }
            }
          }
        }
      }
      enriched.to_json()
    } catch {
      e => {
        invalid += 1
        code = 2
        e.to_json()
      }
    }
    write(
      "{\"line\":" +
      processed.to_string() +
      ",\"input\":" +
      text +
      ",\"enrichment\":" +
      result.stringify() +
      "}\n",
    )
  }
  host_close()
  let sources : Map[String, Json] = Map([])
  for name, state in stats {
    let p = state.provenance
    p["found"] = state.found.to_json()
    p["not_found"] = state.not_found.to_json()
    p["errors"] = state.errors.to_json()
    p["missing_fields"] = state.missing_fields.to_json()
    sources[name] = p.to_json()
  }
  emit(
    {
      "status": "summary",
      "processed": processed.to_json(),
      "valid_ips": valid.to_json(),
      "invalid_inputs": invalid.to_json(),
      "sources": sources.to_json(),
    },
    channel=1,
  )
  code
}

///|
fn status_code(value : Json) -> Int {
  match value {
    Object(m) =>
      match m.get("status") {
        Some(String("error")) => 2
        Some(String("not_found")) => 1
        _ => 0
      }
    _ => 0
  }
}

///|
fn run(args : Array[String]) -> Int raise {
  if args.length() == 2 && args[1] == "--version" {
    write("0.5.0\n")
    return 0
  }
  if args.length() == 2 && args[1] == "--help" {
    write(
      "MoonMMDB 0.5.0 — Native offline MMDB reader\nUsage:\n  moonmmdb metadata DATABASE\n  moonmmdb lookup DATABASE IP [IP ...]\n  moonmmdb project DATABASE IP POINTER [POINTER ...]\n  moonmmdb enrich-many CONFIG INPUT.jsonl|- [OPTIONS]\n  moonmmdb --help | --version\nOptions: --ip-path POINTER (default /ip), --max-records N (10000; cap 1000000),\n  --max-input-bytes N (8388608; cap 1073741824), --max-line-bytes N (8388608; cap 8388608).\nDatabase total <=256 MiB; config <=64 KiB; JSON nesting <=128. UTF-8 JSONL.\nExit codes: 0 all found; 1 any miss; 2 any error. Fields come from configuration.\nstdout: results. stderr: diagnostics and completed summary only. No network access.\n",
    )
    return 0
  }
  if args.length() < 3 {
    fail("host-input-error", "Invalid arguments; use --help")
  }
  let command = args[1]
  if command == "enrich-many" {
    return enrich_many(args)
  }
  if !((command == "metadata" && args.length() == 3) ||
    (command == "lookup" && args.length() >= 4 && args.length() <= 10003) ||
    (command == "project" && args.length() >= 5 && args.length() <= 68)) {
    fail(
      "host-input-error", "Invalid arguments or unsupported command; use --help",
    )
  }
  let reader = @mmdb.open_bytes(read_file(args[2], 268435456))
  if command == "metadata" {
    emit({
      "status": "opened",
      "metadata": reader.metadata().raw.to_tagged_json(),
    })
    return 0
  }
  if command == "project" {
    let fields : Array[String] = []
    for i in 4..<args.length() {
      fields.push(args[i])
    }
    let result = reader.project(args[3], fields).to_json() catch {
        e => e.to_json()
      }
    let out = object(result, "host-input-error")
    out["ip"] = args[3].to_json()
    emit(out.to_json())
    return status_code(result)
  }
  let mut code = 0
  for i in 3..<args.length() {
    let result = reader.lookup(args[i]).to_json() catch { e => e.to_json() }
    code = code.max(status_code(result))
    let out = object(result, "host-input-error")
    out["ip"] = args[i].to_json()
    emit(out.to_json())
  }
  code
}

///|
fn main {
  host_init()
  let fallback = @env.args()
  let args : Array[String] = []
  for i in 0..<fallback.length() {
    args.push(host_arg(i, fallback[i]))
  }
  let code = run(args) catch {
    CliError(code, message, line) => {
      let out : Map[String, Json] = Map([
        ("status", "error"),
        ("code", code.to_json()),
        ("message", message.to_json()),
      ])
      if line > 0 {
        out["line"] = line.to_json()
      }
      emit(out.to_json(), channel=1) catch {
        _ => ()
      }
      2
    }
    @mmdb.MmdbError(_) as e => {
      emit(e.to_json(), channel=1) catch {
        _ => ()
      }
      2
    }
    _ => {
      emit(
        {
          "status": "error",
          "code": "host-input-error",
          "message": "Unexpected host failure",
        },
        channel=1,
      ) catch {
        _ => ()
      }
      2
    }
  }
  host_close()
  exit_process(code)
}
