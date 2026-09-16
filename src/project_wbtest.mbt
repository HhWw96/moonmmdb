///|
test "JSON Pointer root escapes Unicode arrays and missing fields" {
  let value = Object([
    ("", Text("empty")),
    ("a/b", Object([("~key", Text("yes"))])),
    ("中", List([Unsigned32(7), Boolean(false)])),
    ("01", Text("map key")),
    ("__proto__", Text("safe")),
  ])
  assert_eq(value.at_pointer(""), Some(value))
  assert_eq(value.at_pointer("/"), Some(Text("empty")))
  assert_eq(value.at_pointer("/a~1b/~0key"), Some(Text("yes")))
  assert_eq(value.at_pointer("/中/1"), Some(Boolean(false)))
  assert_eq(value.at_pointer("/01"), Some(Text("map key")))
  assert_eq(value.at_pointer("/__proto__"), Some(Text("safe")))
  for
    path in [
      "/missing", "/中/01", "/中/-", "/中/999999999999999999", "/中/0/child",
    ] {
    assert_eq(value.at_pointer(path), None)
  }
  for path in ["x", "#", "/~", "/~2"] {
    let code = try {
      ignore(value.at_pointer(path))
      "no-error"
    } catch {
      e => e.code()
    }
    assert_eq(code, "invalid-path")
  }
}

///|
test "projection preserves integer types and separates record miss from field miss" {
  let reader = open_bytes(fixture_decoder())
  let result = reader.project("1.1.1.3", ["/uint128", "/array/1", "/absent"])
  assert_true(result.record_found)
  assert_eq(result.prefix_length, 24)
  assert_eq(
    result.fields[0].1,
    Some(Unsigned128("1329227995784915872903807060280344576")),
  )
  assert_eq(result.fields[1].1, Some(Unsigned32(2)))
  assert_eq(result.fields[2].1, None)
  let missing = open_bytes(fixture_ipv4_24()).project("255.255.255.255", ["/ip"])
  assert_true(!missing.record_found)
  assert_eq(missing.fields[0].1, None)
  let error = try {
    ignore(reader.project("1.1.1.3", ["/x", "/x"]))
    "none"
  } catch {
    e => e.code()
  }
  assert_eq(error, "invalid-path")
  let error = try {
    ignore(reader.project("bad", []))
    "none"
  } catch {
    e => e.code()
  }
  assert_eq(error, "path-limit")
}

///|
test "projection budgets charge overlapping selections and pointer request limits" {
  let value = Object([("x", Text("abc"))])
  let budget = { values: 10, payload: 6, }
  charge_selection(value, budget)
  let code = try {
    charge_selection(value, budget)
    "none"
  } catch {
    e => e.code()
  }
  assert_eq(code, "payload-limit")
  let code = try {
    charge_selection(value, { values: 2, payload: 100, })
    "none"
  } catch {
    e => e.code()
  }
  assert_eq(code, "value-limit")
  let reader = open_bytes(fixture_decoder())
  let code = try {
    ignore(reader.project("1.1.1.1", Array::make(65, "/x")))
    "none"
  } catch {
    e => e.code()
  }
  assert_eq(code, "path-limit")
  let code = try {
    ignore(value.at_pointer("/".repeat(129)))
    "none"
  } catch {
    e => e.code()
  }
  assert_eq(code, "path-limit")
  let code = try {
    ignore(value.at_pointer("/" + "x".repeat(2048)))
    "none"
  } catch {
    e => e.code()
  }
  assert_eq(code, "path-limit")
}
