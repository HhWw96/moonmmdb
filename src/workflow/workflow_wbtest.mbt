///|
fn sample_task() -> Json {
  {
    "format": "moonmmdb-task",
    "version": 1,
    "operation": "lookup",
    "parameters": { "ip": "192.0.2.1", "fields": [] },
    "files": [{ "role": "database", "name": "sample.mmdb" }],
  }
}

///|
test "task policy rejects extra path, duplicate role, version and deep documents" {
  let good = sample_task()
  assert_eq(check_task(good), good)
  for
    replacement in [
      { "role": "database", "name": "../secret" },
      { "role": "database", "name": "sample", "path": "/secret" },
      { "role": "before", "name": "sample" },
    ] {
    let task = sample_task()
    obj(task)["files"] = [replacement].to_json()
    let accepted = try {
      ignore(check_task(task))
      true
    } catch {
      _ => false
    }
    assert_false(accepted)
  }
  let task = sample_task()
  obj(task)["version"] = 2
  let accepted = try {
    ignore(check_task(task))
    true
  } catch {
    _ => false
  }
  assert_false(accepted)
  let deep = "[".repeat(129) + "0" + "]".repeat(129)
  let accepted = try {
    ignore(parse_json(deep, 8388608))
    true
  } catch {
    _ => false
  }
  assert_false(accepted)
}

///|
test "precise counters reject signs leading zeros fractions and overflow" {
  assert_eq(decimal("18446744073709551615"), 18446744073709551615UL)
  for text in ["-1", "01", "1.0", "18446744073709551616", ""] {
    let accepted = try {
      ignore(decimal(text.to_json()))
      true
    } catch {
      _ => false
    }
    assert_false(accepted)
  }
  let accepted = try {
    ignore(sum(18446744073709551615UL, 1))
    true
  } catch {
    _ => false
  }
  assert_false(accepted)
}

///|
fn complete_report() -> Json raise WorkflowError {
  parse_json(
    "{\"format\":\"moonmmdb-report\",\"version\":1,\"tool\":{\"name\":\"MoonMMDB\",\"version\":\"0.9.2\"},\"task\":{\"format\":\"moonmmdb-task\",\"version\":1,\"operation\":\"analyze\",\"parameters\":{\"ip_path\":\"/ip\",\"top\":10,\"max_groups\":10000,\"max_records\":10000,\"max_input_bytes\":8388608,\"max_line_bytes\":8388608,\"max_json_depth\":128,\"diagnostic_limit\":100},\"files\":[{\"role\":\"city\",\"name\":\"city.mmdb\",\"bytes\":\"550\",\"sha256\":\"02d0c798291448a4ee2797afb115d418e25c61f4d9a995ce0431d94cb1ce0187\"},{\"role\":\"asn\",\"name\":\"asn.mmdb\",\"bytes\":\"564\",\"sha256\":\"dab06da41e8858d2f40b4cd05a89ad924cd5ff8bae5cf533165bbe52dab0da70\"},{\"role\":\"input\",\"name\":\"access.jsonl\",\"bytes\":\"77\",\"sha256\":\"d87211f4d4cab8bbc95b82af08c70046c20210a43a6153da8d12dd12d7de8af0\"}]},\"result\":{\"status\":\"complete\",\"requests\":\"6\",\"valid_ips\":\"2\",\"invalid_inputs\":\"4\",\"exit_code\":2,\"country\":{\"counted\":\"1\",\"not_found\":\"1\",\"missing_field\":\"0\",\"type_error\":\"0\",\"query_error\":\"0\",\"group_count\":\"1\",\"other_requests\":\"0\",\"top\":[{\"key\":\"ZZ\",\"count\":\"1\"}]},\"asn\":{\"counted\":\"1\",\"not_found\":\"1\",\"missing_field\":\"0\",\"type_error\":\"0\",\"query_error\":\"0\",\"group_count\":\"1\",\"other_requests\":\"0\",\"top\":[{\"key\":\"64512\",\"count\":\"1\"}]},\"tool_version\":\"0.9.2\",\"parameters\":{\"ip_path\":\"/ip\",\"top\":10,\"max_groups\":10000,\"max_records\":10000,\"max_input_bytes\":8388608,\"max_line_bytes\":8388608,\"max_json_depth\":128,\"diagnostic_limit\":100},\"diagnostics\":{\"limit\":100,\"retained\":\"5\",\"omitted\":\"0\",\"rows\":[{\"line\":\"2\",\"start\":\"19\",\"end\":\"28\",\"outcome\":{\"input\":\"invalid-jsonl\",\"issues\":[]}},{\"line\":\"3\",\"start\":\"28\",\"end\":\"31\",\"outcome\":{\"input\":\"missing-ip\",\"issues\":[]}},{\"line\":\"4\",\"start\":\"31\",\"end\":\"40\",\"outcome\":{\"input\":\"ip-type-error\",\"issues\":[]}},{\"line\":\"5\",\"start\":\"40\",\"end\":\"56\",\"outcome\":{\"input\":\"invalid-ip\",\"issues\":[]}},{\"line\":\"6\",\"start\":\"56\",\"end\":\"77\",\"outcome\":{\"input\":\"valid\",\"issues\":[{\"dimension\":\"country\",\"category\":\"not_found\"},{\"dimension\":\"asn\",\"category\":\"not_found\"}]}}]},\"databases\":{\"city\":{\"database_type\":\"MoonMMDB-Synthetic-geo\",\"build_epoch\":\"0\",\"sha256\":\"02d0c798291448a4ee2797afb115d418e25c61f4d9a995ce0431d94cb1ce0187\",\"bytes\":\"550\"},\"asn\":{\"database_type\":\"MoonMMDB-Synthetic-asn\",\"build_epoch\":\"0\",\"sha256\":\"dab06da41e8858d2f40b4cd05a89ad924cd5ff8bae5cf533165bbe52dab0da70\",\"bytes\":\"564\"}},\"input\":{\"bytes\":\"77\",\"sha256\":\"d87211f4d4cab8bbc95b82af08c70046c20210a43a6153da8d12dd12d7de8af0\"}}}",
    8388608,
  )
}

///|
test "complete diagnostic report checks and tampering fails on every backend" {
  let report = complete_report()
  assert_eq(get(check_report(report), "level"), "internal")
  let same = parse_json(
    report_compare(report.stringify(), report.stringify()),
    8388608,
  )
  assert_eq(get(same, "status"), "consistent")
  let result = obj(get(report, "result"))
  result["requests"] = "99"
  let accepted = try {
    ignore(check_report(report))
    true
  } catch {
    _ => false
  }
  assert_false(accepted)
  let report = complete_report()
  let diagnostics = obj(get(get(report, "result"), "diagnostics"))
  diagnostics["omitted"] = "1"
  let accepted = try {
    ignore(check_report(report))
    true
  } catch {
    _ => false
  }
  assert_false(accepted)
}
