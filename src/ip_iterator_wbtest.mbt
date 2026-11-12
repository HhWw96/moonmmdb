///|
test "IPv4 octets retain all 65536 low-word combinations" {
  for third in 0..<256 {
    for fourth in 0..<256 {
      let address = parse_ip(
        "172.16." + third.to_string() + "." + fourth.to_string(),
      )
      assert_eq(address.version, 4)
      assert_eq(address.bytes, [172, 16, third, fourth])
    }
  }
}

///|
test "IP iterator parsing preserves strict failures and IPv4 tail placement" {
  for
    (text, message) in [
      ("1.x.3", "Expected four IPv4 octets"),
      ("1.x.3.4", "Non-decimal IPv4 octet"),
      ("1.0000.3.4", "Invalid IPv4 octet"),
      ("1.01.3.4", "Invalid IPv4 octet"),
      ("1.256.3.4", "IPv4 octet exceeds 255"),
      ("1.2.3.", "Invalid IPv4 octet"),
      ("1.2.3.4::", "IPv4 tail must be last"),
      ("::1.2.3.4:5", "IPv4 tail must be last"),
      ("::1.02.3.4", "Invalid IPv4 octet"),
      ("1::2::3", "Multiple IPv6 compressions"),
      ("1:2:3:4:5:6:7", "Expected eight IPv6 groups"),
      ("::ffff:1.2.3.999", "IPv4 octet exceeds 255"),
      ("::ffff:1.2.3.0000", "Invalid IPv4 octet"),
    ] {
    let actual = try {
      ignore(parse_ip(text))
      ("none", 0, "none")
    } catch {
      error => (error.code(), error.offset(), error.message())
    }
    assert_eq(actual, ("invalid-ip", -1, message))
  }
  let tail = parse_ip("::ffff:192.0.2.128")
  assert_eq(tail.version, 6)
  assert_eq(tail.bytes, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 255, 255, 192, 0, 2, 128])
}
