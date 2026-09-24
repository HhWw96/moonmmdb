///|
fn state(top? : Int = 10, max_groups? : Int = 10000) -> Analyzer {
  {
    enricher: None,
    limits: { top, max_groups, },
    fatal: None,
    finished: false,
    closed: false,
    total: 0,
    valid: 0,
    invalid: 0,
    exit_code: 0,
    groups: [Map([]), Map([])],
    counts: [[0, 0, 0, 0, 0], [0, 0, 0, 0, 0]],
  }
}

///|
fn selected(value : @mmdb.Value?, found? : Bool = true) -> @mmdb.SourceResult {
  Selected({ record_found: found, prefix_length: 24, fields: [("", value)], })
}

///|
fn pair(
  country : @mmdb.SourceResult,
  asn : @mmdb.SourceResult,
) -> @mmdb.Enrichment {
  { sources: [("country", country), ("asn", asn)], }
}

///|
fn row(country : String, asn : UInt) -> @mmdb.Enrichment {
  pair(selected(Some(Text(country))), selected(Some(Unsigned32(asn))))
}

///|
fn failed_source() -> @mmdb.SourceResult {
  let _ = @mmdb.prepare_fields(["bad"]) catch { e => return Failed(e) }
  abort("invalid path should fail")
}

///|
test "source resource exhaustion is fatal and does not partially count a row" {
  for code in ["value-limit", "payload-limit", "depth-limit"] {
    let a = state()
    let limits = match code {
      "value-limit" => { ..@mmdb.Limits::default(), max_values: 1, }
      "payload-limit" => { ..@mmdb.Limits::default(), max_payload_bytes: 1, }
      _ => { ..@mmdb.Limits::default(), max_depth: 1, }
    }
    let failed = try {
      ignore(@mmdb.open_bytes(asn_fixture(), limits~))
      abort("expected reader budget error")
    } catch {
      e => @mmdb.Failed(e)
    }
    let actual = try {
      a.accept(pair(selected(Some(Text("GB"))), failed))
      "none"
    } catch {
      e => e.code()
    }
    assert_eq(actual, code)
    assert_eq(a.total, 0)
    assert_eq(a.groups[0].length(), 0)
    let again = try {
      ignore(a.finish())
      "none"
    } catch {
      e => e.code()
    }
    assert_eq(again, code)
    a.close()
    a.close()
  }
}

///|
test "mutually exclusive dimensions conserve valid requests including source failures" {
  let a = state()
  a.accept(row("GB", 7))
  a.accept(
    pair(
      selected(None, found=false),
      selected(Some(Unsigned64(9007199254740993))),
    ),
  )
  a.accept(pair(selected(None), selected(None, found=false)))
  a.accept(pair(selected(Some(Boolean(true))), selected(None)))
  a.accept(pair(failed_source(), selected(Some(Text("7")))))
  a.invalid_input()
  let r = a.finish()
  assert_eq(r.requests, 6)
  assert_eq(r.valid_ips, 5)
  assert_eq(r.invalid_inputs, 1)
  for d in [r.country, r.asn] {
    assert_eq(
      d.counted + d.not_found + d.missing_field + d.type_error + d.query_error,
      5,
    )
  }
  assert_eq(r.country.counted, 1)
  assert_eq(r.country.not_found, 1)
  assert_eq(r.country.missing_field, 1)
  assert_eq(r.country.type_error, 1)
  assert_eq(r.country.query_error, 1)
  assert_eq(r.exit_code, 2)
  assert_true(r.to_json().stringify().contains("9007199254740993"))
}

///|
test "top ties use string order and reports are isolated" {
  let a = state(top=1)
  a.accept(row("GB", 9))
  a.accept(row("CN", 10))
  let r = a.finish()
  assert_eq(r.country.top[0].key, "CN")
  assert_eq(r.asn.top[0].key, "10")
  assert_eq(r.country.group_count, 2)
  assert_eq(r.country.other_requests, 1)
  r.country.top.clear()
  assert_eq(a.finish().country.top.length(), 1)
  let code = try {
    a.invalid_input()
    "none"
  } catch {
    e => e.code()
  }
  assert_eq(code, "analyzer-closed")
  a.close()
  a.close()
  assert_eq(r.asn.top[0].key, "10")
}

///|
test "group cap rejects whole row and fatal status cannot be bypassed" {
  let a = state(max_groups=1)
  a.accept(row("GB", 7))
  a.accept(row("GB", 7))
  let code = try {
    a.accept(row("GB", 8))
    "none"
  } catch {
    e => e.code()
  }
  assert_eq(code, "group-limit")
  assert_eq(a.total, 2)
  assert_eq(a.groups[0].get("GB"), Some(2))
  let code = try {
    a.invalid_input()
    "none"
  } catch {
    e => e.code()
  }
  assert_eq(code, "group-limit")
  let code = try {
    ignore(a.finish())
    "none"
  } catch {
    e => e.code()
  }
  assert_eq(code, "group-limit")
}

///|
test "UTF8 key budget checks bytes at exact boundary" {
  let a = state()
  a.accept(row("中".repeat(85) + "a", 1))
  let code = try {
    a.accept(row("中".repeat(86), 1))
    "none"
  } catch {
    e => e.code()
  }
  assert_eq(code, "key-limit")
  assert_eq(a.total, 1)
}

///|
test "UInt64 overflow is explicit before partial mutation" {
  let a = state()
  a.total = 18446744073709551615
  let code = try {
    a.invalid_input()
    "none"
  } catch {
    e => e.code()
  }
  assert_eq(code, "counter-overflow")
  assert_eq(a.invalid, 0)
  let b = state()
  b.groups[1]["7"] = 18446744073709551615
  let code = try {
    b.accept(row("GB", 7))
    "none"
  } catch {
    e => e.code()
  }
  assert_eq(code, "counter-overflow")
  assert_eq(b.total, 0)
  assert_eq(b.groups[0].length(), 0)
}

///|
test "empty report and missing field do not raise exit code" {
  let a = state()
  assert_eq(a.finish().requests, 0)
  assert_eq(a.finish().exit_code, 0)
  let b = state()
  b.accept(pair(selected(None), selected(None)))
  assert_eq(b.finish().exit_code, 0)
  let c = state()
  c.accept(pair(selected(None, found=false), selected(None)))
  assert_eq(c.finish().exit_code, 1)
}
