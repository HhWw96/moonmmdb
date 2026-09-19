///|
test "prepared selection snapshots configuration and does not retain results" {
  let paths = ["/uint128", "/array/1", "/absent"]
  let selector = prepare_fields(paths)
  paths[0] = "/wrong"
  paths.push("/invalid~2")
  let reader = open_bytes(fixture_decoder())
  let result = reader.project_prepared("1.1.1.3", selector)
  assert_eq(
    result.fields[0],
    ("/uint128", Some(Unsigned128("1329227995784915872903807060280344576"))),
  )
  result.fields[0] = ("tampered", None)
  assert_eq(
    reader.project_prepared("1.1.1.3", selector),
    reader.project("1.1.1.3", ["/uint128", "/array/1", "/absent"]),
  )
}

///|
test "prepared selection works across readers hits misses and validation errors" {
  let selector = prepare_fields(["/ip", "/absent"])
  for data in [fixture_ipv4_24(), fixture_ipv4_28(), fixture_ipv4_32()] {
    let reader = open_bytes(data)
    for ip in ["1.1.1.1", "1.1.1.3", "255.255.255.255"] {
      assert_eq(
        reader.project_prepared(ip, selector),
        reader.project(ip, ["/ip", "/absent"]),
      )
    }
  }
  for paths in [[], ["/bad~2"], ["/x", "/x"], Array::make(65, "/x")] {
    let failed = try {
      ignore(prepare_fields(paths))
      false
    } catch {
      _ => true
    }
    assert_true(failed)
  }
}

///|
test "prepared selection cannot bypass record budgets and budgets reset on reuse" {
  let reader = open_bytes(fixture_decoder())
  let selector = prepare_fields(["/absent"])
  let limited = { ..reader, limits: { ..Limits::default(), max_values: 1, }, }
  let code = try {
    ignore(limited.project_prepared("1.1.1.3", selector))
    "none"
  } catch {
    e => e.code()
  }
  assert_eq(code, "value-limit")
  let root = prepare_fields([""])
  for _ in 0..<100 {
    assert_eq(
      reader.project_prepared("1.1.1.3", root),
      reader.project("1.1.1.3", [""]),
    )
  }
}
