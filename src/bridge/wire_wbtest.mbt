///|
test "wire enrichment preserves all decoded types, escaping and source outcomes" {
  let values : Array[@mmdb.Value] = [
    Text("引号\"斜线/反斜线\\换行\n\r\t\b\u{000c}\u{0000}\u{001f}😀"),
    Blob(b"\x00\x01\x0f\x10\xff"),
    Boolean(true),
    Boolean(false),
    Unsigned16(65535),
    Unsigned32(4294967295),
    Signed32(-2147483648),
    Unsigned64(18446744073709551615),
    Unsigned128("340282366920938463463374607431768211455"),
    Real32({ bits: 0x80000000, }),
    Real32({ bits: 0x7f800000, }),
    Real32({ bits: 0x7f800001, }),
    Real64({ bits: 0x8000000000000000, }),
    Real64({ bits: 0x7ff0000000000001, }),
    List([Text("nested"), Object([("key\"😀", Unsigned32(7))])]),
    Object([]),
    List([]),
  ]
  let error = try {
    @mmdb.validate_paths(["bad"])
    abort("Expected path validation error")
  } catch {
    error => error
  }
  let result : @mmdb.Enrichment = {
    sources: [
      (
        "valid",
        Selected({
          record_found: true,
          prefix_length: 128,
          fields: [("/types", Some(List(values))), ("/missing", None)],
        }),
      ),
      (
        "missing",
        Selected({
          record_found: false,
          prefix_length: 0,
          fields: [("", None)],
        }),
      ),
      ("failed", Failed(error)),
    ],
  }
  assert_eq(wire_enrichment(result), result.to_json().stringify())
  for status in [true, false] {
    let result : @mmdb.Enrichment = {
      sources: [
        (
          "source",
          Selected({
            record_found: status,
            prefix_length: 24,
            fields: [("", Some(List(values)))],
          }),
        ),
      ],
    }
    assert_eq(wire_enrichment(result), result.to_json().stringify())
  }
}

///|
test "wire writer matches JSON escaping for every control character" {
  for code in 0..<32 {
    let text = "before" + code.unsafe_to_char().to_string() + "after😀"
    let out = StringBuilder()
    wire_string(out, text)
    assert_eq(out.to_string(), text.to_json().stringify())
  }
}

///|
test "wire writer keeps bounded nested records and independent calls" {
  let mut value : @mmdb.Value = Text("leaf")
  for _ in 0..<256 {
    value = List([value])
  }
  let out = StringBuilder()
  wire_value(out, value)
  assert_eq(out.to_string(), value.to_tagged_json().stringify())
  let another = StringBuilder()
  wire_value(another, Text("next"))
  assert_eq(
    another.to_string(),
    @mmdb.Value::Text("next").to_tagged_json().stringify(),
  )
}
