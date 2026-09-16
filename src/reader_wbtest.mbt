///|
test "official IPv4 databases across all three node layouts" {
  for data in [fixture_ipv4_24(), fixture_ipv4_28(), fixture_ipv4_32()] {
    let reader = open_bytes(data)
    assert_eq(reader.metadata().ip_version, 4)
    let result = reader.lookup("1.1.1.3")
    assert_eq(result.prefix_length, 31)
    assert_eq(result.value.unwrap().get("ip"), Some(Text("1.1.1.2")))
    assert_eq(
      reader.lookup("1.1.1.1").value.unwrap().get("ip"),
      Some(Text("1.1.1.1")),
    )
    assert_eq(reader.lookup("255.255.255.255").value, None)
    let err = try {
      ignore(reader.lookup("::1"))
      "no-error"
    } catch {
      e => e.code()
    }
    assert_eq(err, "ip-version-mismatch")
  }
}

///|
test "official IPv6 layouts and IPv4 no-hit prefix" {
  for data in [fixture_ipv6_24(), fixture_ipv6_28(), fixture_ipv6_32()] {
    let reader = open_bytes(data)
    let result = reader.lookup("::2:0:1")
    assert_eq(result.prefix_length, 122)
    assert_eq(result.value.unwrap().get("ip"), Some(Text("::2:0:0")))
    assert_eq(
      reader.lookup("::1:ffff:ffff").value.unwrap().get("ip"),
      Some(Text("::1:ffff:ffff")),
    )
    assert_eq(reader.lookup("1.1.1.1"), { value: None, prefix_length: 8, })
  }
}

///|
test "official rich record preserves large integers arrays and bytes" {
  let result = open_bytes(fixture_decoder()).lookup("1.1.1.3")
  assert_eq(result.prefix_length, 24)
  let value = result.value.unwrap()
  assert_eq(
    value.get("uint128"),
    Some(Unsigned128("1329227995784915872903807060280344576")),
  )
  assert_eq(value.get("int32"), Some(Signed32(-268435456)))
  assert_eq(
    value.get("array"),
    Some(List([Unsigned32(1), Unsigned32(2), Unsigned32(3)])),
  )
  assert_eq(value.get("bytes"), Some(Blob(b"\x00\x00\x00*")))
}

///|
test "damaged metadata separator and oversized declarations reject opening" {
  for
    bytes in [
      b"", b"hello", b"\xab\xcd\xefMaxMind.com", b"\xab\xcd\xefMaxMind.com\xe0",
    ] {
    let fails = try {
      ignore(open_bytes(bytes))
      false
    } catch {
      _ => true
    }
    assert_true(fails)
  }
  let source = fixture_ipv4_24()
  let reader = open_bytes(source)
  let bytes = source.to_array()
  bytes[reader.tree_end] = 1
  let err = try {
    ignore(open_bytes(Bytes::from_array(bytes)))
    "no-error"
  } catch {
    e => e.code()
  }
  assert_eq(err, "invalid-separator")
  let err = try {
    ignore(
      open_bytes(source, limits={ ..Limits::default(), max_file_bytes: 10, }),
    )
    "no-error"
  } catch {
    e => e.code()
  }
  assert_eq(err, "file-limit")
}

///|
test "official mixed layouts and metadata section pointers" {
  for data in [fixture_mixed_24(), fixture_mixed_28(), fixture_mixed_32()] {
    let reader = open_bytes(data)
    assert_eq(reader.metadata().ip_version, 6)
    assert_eq(
      reader.lookup("1.1.1.1").value.unwrap().get("ip"),
      Some(Text("::1.1.1.1")),
    )
  }
  let reader = open_bytes(fixture_metadata_pointers())
  assert_eq(reader.metadata().format_major, 2)
}
