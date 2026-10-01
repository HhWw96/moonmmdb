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

///|
test "short ASCII fast decoding keeps every code unit and range boundary" {
  for size in 0..<65 {
    for shift in 0..<128 {
      let bytes = Bytes::makei(size, i => ((i * 17 + shift) % 128).to_byte())
      assert_eq(text_actual(bytes), text_expected(bytes))
    }
  }
}

///|
fn text_valid_expected(bytes : Bytes) -> Bool {
  try {
    ignore(@utf8.decode(bytes[:], ignore_bom=false))
    true
  } catch {
    _ => false
  }
}

///|
fn text_valid_actual(bytes : Bytes) -> Bool {
  let padded = Bytes::makei(bytes.length() + 4, i => {
    if i >= 2 && i < bytes.length() + 2 {
      bytes[i - 2]
    } else {
      0xff
    }
  })
  valid_text_range(padded, 2, bytes.length())
}

///|
test "unretained UTF8 eagerly validates every one and two byte sequence" {
  assert_true(text_valid_actual(b""))
  for first in 0..<256 {
    let bytes = Bytes::from_array([first.to_byte()])
    assert_eq(text_valid_actual(bytes), text_valid_expected(bytes))
    for second in 0..<256 {
      let bytes = Bytes::from_array([first.to_byte(), second.to_byte()])
      assert_eq(text_valid_actual(bytes), text_valid_expected(bytes))
    }
  }
}

///|
test "unretained UTF8 validates multibyte ranges truncation BOM and byte boundaries" {
  let boundaries = [0, 0x7f, 0x80, 0x8f, 0x90, 0x9f, 0xa0, 0xbf, 0xc0, 0xff]
  for first in 0xe0..<0xf5 {
    for second in 0..<256 {
      for third in boundaries {
        let bytes = Bytes::from_array([
          first.to_byte(),
          second.to_byte(),
          third.to_byte(),
        ])
        assert_eq(text_valid_actual(bytes), text_valid_expected(bytes))
        for fourth in boundaries {
          let bytes = Bytes::from_array([
            first.to_byte(),
            second.to_byte(),
            third.to_byte(),
            fourth.to_byte(),
          ])
          assert_eq(text_valid_actual(bytes), text_valid_expected(bytes))
        }
      }
    }
  }
  for text in ["\u{feff}", "a\u{0}z", "é中🌍\u{10ffff}"] {
    let bytes = @utf8.encode(text)
    assert_true(text_valid_actual(bytes))
    for end in 0..<bytes.length() {
      let part = bytes[:end].to_owned()
      assert_eq(text_valid_actual(part), text_valid_expected(part))
    }
  }
}
