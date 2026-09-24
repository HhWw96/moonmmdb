///|
test "public construction, invalid IP and source lifetime isolation" {
  let bytes = asn_fixture()
  let reader = @mmdb.open_bytes(bytes)
  let a = Analyzer::new(reader, reader)
  a.push("1.0.0.1")
  a.push("2001:db8::1")
  a.push("bad-ip")
  let report = a.finish()
  assert_eq(report.requests, 3)
  assert_eq(report.valid_ips, 2)
  assert_eq(report.invalid_inputs, 1)
  assert_eq(report.country.missing_field, 1)
  assert_eq(report.asn.top[0].key, "15169")
  assert_eq(reader.lookup("1.0.0.1").value is Some(_), true)
  for
    limits in [
      { top: 0, max_groups: 1, },
      { top: 101, max_groups: 1, },
      { top: 1, max_groups: 0, },
      { top: 1, max_groups: 10001, },
    ] {
    let code = try {
      ignore(Analyzer::new(reader, reader, limits~))
      "none"
    } catch {
      e => e.code()
    }
    assert_eq(code, "invalid-limits")
  }
}

///|
test "default cap accepts exactly 10000 distinct groups" {
  let a = state()
  for i in 0..<10000 {
    a.accept(row(i.to_string(), i.reinterpret_as_uint()))
  }
  a.accept(row("0", 0))
  assert_eq(a.groups[0].length(), 10000)
  let code = try {
    a.accept(row("10000", 10000))
    "none"
  } catch {
    e => e.code()
  }
  assert_eq(code, "group-limit")
  assert_eq(a.valid, 10001)
}
