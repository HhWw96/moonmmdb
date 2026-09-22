///|
suberror DiffDatabaseError {
  DiffDatabaseError(String, @mmdb.MmdbError)
}

///|
/// Load each snapshot once, before opening the input stream. The aggregate file
/// limit bounds input bytes, not the process working set or reader snapshots.
fn diff_database(
  path : String,
  side : String,
  remaining : Int,
) -> (@mmdb.Reader, Json, Int) raise {
  let bytes = read_file(path, remaining) catch {
    CliError(code, message, line) =>
      raise CliError(code, side + " database: " + message, line)
  }
  let reader = @mmdb.open_bytes(bytes) catch {
    e => raise DiffDatabaseError(side, e)
  }
  let meta = reader.metadata()
  let provenance : Json = {
    "bytes": bytes.length().to_json(),
    "sha256": @crypto.bytes_to_hex_string(@crypto.sha256(bytes)).to_json(),
    "database_type": meta.database_type.to_json(),
    "build_epoch": meta.build_epoch.to_string().to_json(),
  }
  (reader, provenance, bytes.length())
}

///|
fn diff(args : Array[String]) -> Int raise {
  if args.length() < 5 || (args.length() - 5) % 2 != 0 {
    fail(
      "host-input-error", "Expected BEFORE AFTER INPUT and option/value pairs",
    )
  }
  let fields : Array[String] = []
  let mut ip_path = "/ip"
  let mut max_bytes = 8388608
  let mut max_line = 8388608
  let mut max_records = 10000
  let seen : Map[String, Bool] = Map([])
  for i = 5; i < args.length(); i = i + 2 {
    let flag = args[i]
    if flag == "--field" {
      if fields.length() >= 64 {
        fail("host-input-error", "At most 64 field paths are allowed")
      }
      fields.push(args[i + 1])
      continue
    }
    if seen.contains(flag) {
      fail("host-input-error", "Duplicate option: " + flag)
    }
    seen[flag] = true
    match flag {
      "--ip-path" => ip_path = args[i + 1]
      "--max-input-bytes" => max_bytes = positive(args[i + 1], 1073741824)
      "--max-line-bytes" => max_line = positive(args[i + 1], 8388608)
      "--max-records" => max_records = positive(args[i + 1], 1000000)
      _ => fail("host-input-error", "Unknown option: " + flag)
    }
  }
  @mmdb.validate_paths([ip_path])
  if fields.is_empty() {
    fields.push("")
  }
  let selector = @mmdb.prepare_fields(fields)
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
  let (before, before_info, before_bytes) = diff_database(
    args[2],
    "before",
    268435456,
  )
  let (after, after_info, _) = diff_database(
    args[3],
    "after",
    268435456 - before_bytes,
  )
  host_open(c_path(args[4]), max_bytes, max_line)
  check_io()
  defer host_close()
  let mut processed = 0
  let mut changed = 0
  let mut unchanged = 0
  let mut errors = 0
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
        errors += 1
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
      let result = before.compare_prepared(after, ip, selector)
      if result.changed() {
        changed += 1
        code = code.max(1)
      } else {
        unchanged += 1
      }
      result.to_json()
    } catch {
      e => {
        errors += 1
        code = 2
        e.to_json()
      }
    }
    // Preserve numeric lexemes, negative zero and escapes in the validated row.
    // Synchronous host writes finish before reading the next record.
    write(
      "{\"line\":" +
      processed.to_string() +
      ",\"input\":" +
      text +
      ",\"diff\":" +
      result.stringify() +
      "}\n",
    )
  }
  emit(
    {
      "status": "summary",
      "processed": processed.to_json(),
      "changed": changed.to_json(),
      "unchanged": unchanged.to_json(),
      "errors": errors.to_json(),
      "fields": fields.to_json(),
      "databases": { "before": before_info, "after": after_info },
    },
    channel=1,
  )
  code
}
