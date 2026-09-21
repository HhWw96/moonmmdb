// Official MaxMind maps-with-pointers.raw; Apache-2.0 OR MIT.

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
