// Official MaxMind maps-with-pointers.raw; Apache-2.0 OR MIT.

///|
test "nested pointer return resumes at encoded sibling and unsigned offsets reject overflow" {
  let bytes = b"\x03\x04\x20\x0a\x00\x07\xe0\x00\x00\x00\x02\x04\xc1\x01\x01\x07"
  let ctx = decoder(bytes, 0, bytes.length(), Limits::default())
  let inner = List([Unsigned32(1), Boolean(true)])
  assert_eq(decode(ctx, 0, 0), (List([inner, Boolean(false), Object([])]), 7))
  assert_eq(decode(ctx, 10, 0), (inner, 16))
  assert_eq(decode(ctx, 2, 0), (inner, 4))
  decode_error(b"\x38\xff\xff\xff\xff", "out-of-bounds")
  decode_error(b"\x38\x80\x00\x00\x00", "out-of-bounds")
  assert_eq(decode_sample(b"\xc4\x80\x00\x00\x00"), Unsigned32(2147483648))
  assert_eq(decode_sample(b"\x04\x01\x80\x00\x00\x00"), Signed32(-2147483648))
}

///|
test "official raw shared map pointers preserve record boundaries" {
  let data = b"\xe1\x48\x6c\x6f\x6e\x67\x5f\x6b\x65\x79\x4b\x6c\x6f\x6e\x67\x5f\x76\x61\x6c\x75\x65\x31\xe1\x20\x01\x4b\x6c\x6f\x6e\x67\x5f\x76\x61\x6c\x75\x65\x32\xe1\x49\x6c\x6f\x6e\x67\x5f\x6b\x65\x79\x32\x20\x0a\xe1\x20\x26\x20\x19\x20\x00\x20\x32"
  let offsets = [0, 22, 37, 50, 55, 57]
  let ends = [22, 37, 50, 55, 57, 59]
  let keys = [
    "long_key", "long_key", "long_key2", "long_key2", "long_key", "long_key2",
  ]
  let values = [
    "long_value1", "long_value2", "long_value1", "long_value2", "long_value1", "long_value2",
  ]
  for i in 0..<offsets.length() {
    let (value, end) = decode(
      decoder(data, 0, data.length(), Limits::default()),
      offsets[i],
      0,
    )
    assert_eq(value, Object([(keys[i], Text(values[i]))]))
    assert_eq(end, ends[i])
  }
}
