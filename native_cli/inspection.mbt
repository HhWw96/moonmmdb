///|
fn inspection(args : Array[String]) -> Int32 raise {
  let networks = args[1] == "networks"
  if networks && args.length() < 4 {
    fail("host-input-error", "Expected CIDR")
  }
  let mut max_records = 100000
  let mut max_work = 100000000
  let mut max_state_bytes = 67108864
  let mut decode_data = false
  let seen : Map[String, Bool] = Map([])
  let mut i = if networks { 4 } else { 3 }
  while i < args.length() {
    let key = args[i]
    if seen.contains(key) {
      fail("host-input-error", "Duplicate option")
    }
    seen[key] = true
    if key == "--decode-data" && !networks {
      decode_data = true
      i = i + 1
      continue
    }
    if i + 1 >= args.length() {
      fail("host-input-error", "Missing option value")
    }
    match key {
      "--max-work" => max_work = positive(args[i + 1], 1000000000)
      "--max-records" if networks =>
        max_records = positive(args[i + 1], 1000000)
      "--max-state-bytes" if !networks =>
        max_state_bytes = positive(args[i + 1], 268435456)
      _ => fail("host-input-error", "Unsupported inspection option")
    }
    i = i + 2
  }
  let bytes = read_file(args[2], 268435456)
  let reader = @mmdb.open_bytes(bytes) catch {
    e => {
      emit(
        if networks {
          e.to_json()
        } else {
          e.to_validation_json()
        },
        channel=if networks { 1 } else { 0 },
      )
      return 2
    }
  }
  let metadata = reader.metadata()
  let provenance : Map[String, Json] = Map([
    (
      "sha256",
      @json.to_json(@crypto.bytes_to_hex_string(@crypto.sha256(bytes))),
    ),
    ("bytes", @json.to_json(bytes.length())),
    ("database_type", @json.to_json(metadata.database_type)),
    ("build_epoch", @json.to_json(metadata.build_epoch.to_string())),
  ])
  if !networks {
    let result = reader
      .validate(decode_data~, limits={ max_work, max_state_bytes, })
      .to_json() catch {
        e => e.to_validation_json()
      }
    let report = object(result, "host-input-error")
    for key, value in provenance {
      report[key] = value
    }
    emit(@json.to_json(report))
    return if report.get("status") == Some(@json.to_json("valid")) {
      0
    } else {
      2
    }
  }
  let cursor = reader.networks(args[3], limits={ max_records, max_work, })
  defer cursor.close()
  while cursor.next() is Some(record) {
    emit(record.to_json())
  }
  provenance["status"] = "summary"
  provenance["scope"] = @json.to_json(args[3])
  provenance["records"] = @json.to_json(cursor.emitted_count())
  provenance["work_used"] = @json.to_json(cursor.work_used())
  emit(@json.to_json(provenance), channel=1)
  if cursor.emitted_count() == 0 {
    1
  } else {
    0
  }
}
