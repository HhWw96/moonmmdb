///|
test "decode terminal error cannot be bypassed by reusing its operation" {
  let bytes = b"\x42\xff\xff"
  let ctx = decoder(bytes, 0, bytes.length(), Limits::default())
  for offset in [0, 0, 1] {
    let error = try {
      ignore(decode(ctx, offset, 0))
      ("none", -1)
    } catch {
      error => (error.code(), error.offset())
    }
    assert_eq(error, ("invalid-utf8", 1))
    assert_eq(ctx.active, [])
  }
  let good = decoder(b"\x41x", 0, 2, Limits::default())
  assert_eq(decode(good, 0, 0).0, Text("x"))
}

///|
test "map keys preserve nested error priority and reject nontext containers" {
  for
    (bytes, expected) in [
      (b"\xe1\x00\x04\x00\x07", ("invalid-map-key", 1)),
      (b"\xe1\xe1\x41x\x41v\x00\x07", ("invalid-map-key", 1)),
      (b"\xe1\xe1\x41x\x42\xff\xff\x00\x07", ("invalid-utf8", 5)),
      (b"\xe1\x01\x04\x42\xff\xff\x00\x07", ("invalid-utf8", 4)),
    ] {
    assert_eq(retained_error(bytes, [""]), expected)
    assert_eq(retained_error(bytes, ["/absent"]), expected)
  }
  let empty_key = b"\xe1\x40\x41v"
  assert_eq(retained_decode(empty_key, ["/"]).at_pointer("/"), Some(Text("v")))
  let pointer_key = b"\xe1\x20\x05\x41v\x41k"
  let ctx = decoder(pointer_key, 0, pointer_key.length(), Limits::default())
  let (value, end) = decode(ctx, 0, 0)
  assert_eq(value, Object([("k", Text("v"))]))
  assert_eq(end, 5)
}

///|
test "64 bit decoding is exact at every encoded width and offset" {
  for
    (bytes, full) in [
      (b"x\xfe\xdc\xba\x98\x76\x54\x32\x10y", 0xfedcba9876543210UL),
      (b"x\xff\xff\xff\xff\xff\xff\xff\xffy", 0xffffffffffffffffUL),
      (b"x\x00\x00\x00\x00\x00\x00\x00\x01y", 1UL),
    ] {
    let ctx = decoder(bytes, 0, bytes.length(), Limits::default())
    for size in 0..<=8 {
      let expected = if size == 0 { 0UL } else { full >> (64 - size * 8) }
      assert_eq(uint_be(ctx, 1, size), expected)
      assert_true(ctx.failure is None)
    }
  }
}
