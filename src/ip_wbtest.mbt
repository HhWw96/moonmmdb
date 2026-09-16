///|
test "strict IP parsing and equivalent IPv6 spellings" {
  assert_eq(parse_ip("255.0.1.2").bytes, [255, 0, 1, 2])
  assert_eq(
    parse_ip("2001:db8::1").bytes,
    parse_ip("2001:0DB8:0:0:0:0:0:1").bytes,
  )
  assert_eq(
    parse_ip("::ffff:192.0.2.1").bytes,
    parse_ip("0:0:0:0:0:ffff:c000:201").bytes,
  )
  assert_eq(parse_ip("::").bytes, Array::make(16, 0))
}

///|
test "malformed and ambiguous IP inputs are rejected" {
  for
    ip in [
      "", "1.2.3", "1.2.3.256", "01.2.3.4", "1.2.3.4 ", "1.2.3.-1", ":::", "1::2::3",
      "1:2:3:4:5:6:7:8::", "fe80::1%eth0", "[::1]", "1.2.3.4/24", "1.2.3.4::", "::ffff:192.0.2.01",
      "1:2:3:4:5:6:7", "gggg::",
    ] {
    let failed = try {
      ignore(parse_ip(ip))
      false
    } catch {
      _ => true
    }
    assert_true(failed, msg=ip)
  }
}
