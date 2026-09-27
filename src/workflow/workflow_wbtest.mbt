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
