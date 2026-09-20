///|
test "enrichment snapshots sources and results and retains per source missing fields" {
  let reader = open_bytes(fixture_ipv4_24())
  let sources : Array[EnrichmentSource] = [
    { name: "first", reader, fields: prepare_fields(["/ip", "/absent"]), },
  ]
  let enricher = Enricher::new(sources)
  sources[0] = { name: "changed", reader, fields: prepare_fields([""]), }
  let result = enricher.lookup("1.1.1.3")
  assert_eq(result.status_code(), 0)
  assert_eq(result.sources[0].0, "first")
  match result.sources[0].1 {
    Selected(p) => {
      assert_eq(p.fields[1].1, None)
      p.fields[0] = ("tampered", None)
    }
    _ => fail("expected projection")
  }
  match enricher.lookup("1.1.1.3").sources[0].1 {
    Selected(p) => assert_eq(p.fields[0].0, "/ip")
    _ => fail("expected projection")
  }
  assert_eq(enricher.lookup("255.255.255.255").status_code(), 1)
}

///|
test "enrichment validates names counts and invalid IP before database queries" {
  let reader = open_bytes(fixture_ipv4_24())
  let fields = prepare_fields(["/ip"])
  for
    name in [
      "", "1a", "with space", "中文", "abcdefghijklmnopqrstuvwxyz1234567",
    ] {
    let code = try {
      ignore(Enricher::new([{ name, reader, fields, }]))
      "none"
    } catch {
      e => e.code()
    }
    assert_eq(code, "invalid-source")
  }
  for count in [0, 5] {
    let code = try {
      ignore(Enricher::new(Array::make(count, { name: "a", reader, fields, })))
      "none"
    } catch {
      e => e.code()
    }
    assert_eq(code, "source-limit")
  }
  let code = try {
    ignore(Enricher::new(Array::make(2, { name: "a", reader, fields, })))
    "none"
  } catch {
    e => e.code()
  }
  assert_eq(code, "duplicate-source")
  let enricher = Enricher::new([{ name: "A_1-b", reader, fields, }])
  let code = try {
    ignore(enricher.lookup("not an ip"))
    "none"
  } catch {
    e => e.code()
  }
  assert_eq(code, "invalid-ip")
}

///|
test "enrichment isolates decoder errors and resets budgets" {
  let reader = open_bytes(fixture_decoder())
  let limited = { ..reader, limits: { ..Limits::default(), max_values: 1, }, }
  let fields = prepare_fields(["/uint128"])
  let enricher = Enricher::new([
    { name: "limited", reader: limited, fields, },
    { name: "good", reader, fields, },
  ])
  for _ in 0..<20 {
    let result = enricher.lookup("1.1.1.3")
    assert_eq(result.status_code(), 2)
    match result.sources[0].1 {
      Failed(e) => assert_eq(e.code(), "value-limit")
      _ => fail("expected bounded error")
    }
    match result.sources[1].1 {
      Selected(p) => assert_true(p.record_found)
      _ => fail("other source lost")
    }
  }
}

///|
test "enrichment isolates address family failures and partial misses" {
  let fields = prepare_fields([""])
  let enricher = Enricher::new([
    { name: "v4", reader: open_bytes(fixture_ipv4_24()), fields, },
    { name: "v6", reader: open_bytes(fixture_ipv6_24()), fields, },
  ])
  let result = enricher.lookup("::1:ffff:ffff")
  match result.sources[0].1 {
    Failed(e) => assert_eq(e.code(), "ip-version-mismatch")
    _ => fail("expected family error")
  }
  match result.sources[1].1 {
    Selected(p) => assert_true(p.record_found)
    _ => fail("v6 query lost")
  }
  assert_eq(result.status_code(), 2)
  let partial = enricher.lookup("1.1.1.3")
  assert_eq(partial.status_code(), 1)
}
