///|
fn retained_decode(
  bytes : Bytes,
  paths : Array[String],
) -> Value raise MmdbError {
  let ctx = decoder(bytes, 0, bytes.length(), Limits::default())
  let (value, end) = decode(
    ctx,
    0,
    0,
    retention=prepare_fields(paths).retention,
  )
  assert_eq(end, bytes.length()) catch {
    _ => abort("Unexpected encoded end")
  }
  value
}

///|
fn retained_error(bytes : Bytes, paths : Array[String]) -> (String, Int) {
  try {
    ignore(retained_decode(bytes, paths))
    ("none", -1)
  } catch {
    e => (e.code(), e.offset())
  }
}

///|
test "projection retention preserves arrays scalars and whole selected branches" {
  let bytes = b"\x03\x04\x41a\x00\x07\xc1\x07"
  let retained = retained_decode(bytes, [
    "/2", "/0/x", "/01", "/-", "/99999999999999999",
  ])
  assert_eq(retained.at_pointer("/2"), Some(Unsigned32(7)))
  for path in ["/0/x", "/01", "/-", "/99999999999999999"] {
    assert_eq(retained.at_pointer(path), None)
  }
  assert_eq(
    retained_decode(bytes, [""]),
    List([Text("a"), Boolean(false), Unsigned32(7)]),
  )
  let object = b"\xe2\x41a\xe1\x41x\x41v\x41b\x20\x03"
  let retained = retained_decode(object, ["/a/x", "/b", "/missing"])
  assert_eq(retained.at_pointer("/a/x"), Some(Text("v")))
  assert_eq(retained.at_pointer("/b"), Some(Object([("x", Text("v"))])))
  assert_eq(retained.at_pointer("/missing"), None)
  for bytes in [b"\x41x", b"\xc1\x07", b"\x01\x07"] {
    let value = retained_decode(bytes, ["/absent"])
    assert_eq(value.at_pointer("/absent"), None)
  }
}

///|
test "projection retention cannot hide malformed unused fields" {
  for
    (bytes, expected) in [
      (b"\xe2\x41k\x01\x07\x43bad\x42\xc0\x80", ("invalid-utf8", 10)),
      (b"\xe2\x41k\x01\x07\x41k\x01\x07", ("duplicate-key", 5)),
      (b"\xe2\x41k\x01\x07\xc1\x01\x01\x07", ("invalid-map-key", 5)),
      (b"\xe2\x41k\x01\x07\x43bad\x20\x00", ("pointer-cycle", 0)),
      (b"\xe2\x41k\x01\x07\x43bad\x20\x0b\x20\x00", ("pointer-to-pointer", 9)),
      (b"\xe2\x41k\x01\x07\x43bad\x00\x05", ("unsupported-type", 9)),
      (b"\xe2\x41k\x01\x07\x43bad\x02\x07", ("invalid-size", 9)),
    ] {
    assert_eq(retained_error(bytes, [""]), expected)
    assert_eq(retained_error(bytes, ["/k"]), expected)
    assert_eq(retained_error(bytes, ["/absent"]), expected)
  }
}

///|
test "projection retention consumes identical work payload and decode budgets" {
  let bytes = b"\xe2\x41a\xe1\x41x\x41v\x41b\x20\x03"
  let full_work = operation_work(1000)
  let selected_work = operation_work(1000)
  let full = decoder(
    bytes,
    0,
    bytes.length(),
    Limits::default(),
    work=Some(full_work),
  )
  let selected = decoder(
    bytes,
    0,
    bytes.length(),
    Limits::default(),
    work=Some(selected_work),
  )
  ignore(decode(full, 0, 0))
  ignore(
    decode(selected, 0, 0, retention=prepare_fields(["/absent"]).retention),
  )
  assert_eq(selected.remaining, full.remaining)
  assert_eq(selected.payload, full.payload)
  assert_eq(selected.next, full.next)
  assert_eq(selected.active, [])
  assert_eq(selected_work.remaining, full_work.remaining)
  for
    limits in [
      { ..Limits::default(), max_values: 3, },
      { ..Limits::default(), max_payload_bytes: 3, },
      { ..Limits::default(), max_depth: 1, },
    ] {
    let expected = try {
      ignore(decode(decoder(bytes, 0, bytes.length(), limits), 0, 0))
      ("none", -1)
    } catch {
      e => (e.code(), e.offset())
    }
    let actual = try {
      ignore(
        decode(
          decoder(bytes, 0, bytes.length(), limits),
          0,
          0,
          retention=prepare_fields(["/absent"]).retention,
        ),
      )
      ("none", -1)
    } catch {
      e => (e.code(), e.offset())
    }
    assert_true(expected.0 != "none")
    assert_eq(actual, expected)
  }
}

///|
test "projection retention agrees with all typed fixture fields and overlaps" {
  let reader = open_bytes(fixture_decoder())
  let full = reader.lookup("1.1.1.3").value.unwrap()
  let paths = [
    "/array", "/array/1", "/uint128", "/bytes", "/double", "/float", "/missing",
    "/array/01",
  ]
  let result = reader.project_prepared("1.1.1.3", prepare_fields(paths))
  for i in 0..<paths.length() {
    assert_eq(result.fields[i].1, full.at_pointer(paths[i]))
  }
  let paths = ["", "/array/1", "/uint128", "/missing"]
  let result = reader.project_prepared("1.1.1.3", prepare_fields(paths))
  for i in 0..<paths.length() {
    assert_eq(result.fields[i].1, full.at_pointer(paths[i]))
  }
}

///|
test "projection retention never retains prior results or shares its sentinel" {
  let reader = open_bytes(fixture_decoder())
  let selector = prepare_fields(["/array", "/array/1", "/absent"])
  let result = reader.project_prepared("1.1.1.3", selector)
  let initial = reader.project_prepared("1.1.1.3", selector)
  if result.fields[0].1 is Some(List(items)) {
    items[0] = Text("tampered")
  }
  result.fields[1] = ("wrong", Some(Boolean(false)))
  assert_eq(reader.project_prepared("1.1.1.3", selector), initial)
  assert_eq(
    reader.project_prepared("1.1.1.3", prepare_fields(["/absent"])).fields[0].1,
    None,
  )
}
