///|
fn text_expected(bytes : Bytes) -> String {
  try "ok:" + @utf8.decode(bytes[:], ignore_bom=false) catch {
    _ => "invalid"
  }
}

///|
fn text_actual(bytes : Bytes) -> String raise {
  let padded = Bytes::makei(bytes.length() + 4, i => {
    if i >= 2 && i < bytes.length() + 2 {
      bytes[i - 2]
    } else {
      0xff
    }
  })
  try "ok:" + text_range(padded, 2, bytes.length()) catch {
    e => {
      assert_eq(e.code(), "invalid-utf8")
      assert_eq(e.offset(), 2)
      "invalid"
    }
  }
}

///|
test "range text decoding agrees with strict UTF8 for all one and two byte inputs" {
  assert_eq(text_actual(b""), "ok:")
  for first in 0..<256 {
    let bytes = Bytes::from_array([first.to_byte()])
    assert_eq(text_actual(bytes), text_expected(bytes))
    for second in 0..<256 {
      let bytes = Bytes::from_array([first.to_byte(), second.to_byte()])
      assert_eq(text_actual(bytes), text_expected(bytes))
    }
  }
}

///|
test "range text decoding preserves Unicode BOM NUL and rejects malformed scalars" {
  for
    text in ["\u{feff}", "\u{feff}abc", "\u{0}", "中\u{1f600}", "a\u{10ffff}z"] {
    let bytes = @utf8.encode(text)
    assert_eq(text_actual(bytes), "ok:" + text)
  }
  for
    bytes in [
      b"\xe0\x80\x80", b"\xed\xa0\x80", b"\xf0\x80\x80\x80", b"\xf4\x90\x80\x80",
      b"\xef\xbb", b"\xf0\x9f\x98", b"a\xffz",
    ] {
    assert_eq(text_actual(bytes), "invalid")
  }
}
