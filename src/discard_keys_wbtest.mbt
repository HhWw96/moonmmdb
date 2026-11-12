///|
fn key_validation_signature(
  bytes : Bytes,
  retention : Retention,
  limits~ : Limits = Limits::default(),
  max_work~ : Int32 = 10000,
) -> (String, Int32, Int32, Int32, Int32, Int32) raise MmdbError {
  let work = operation_work(max_work)
  let ctx = decoder(bytes, 0, bytes.length(), limits, work=Some(work))
  let outcome = try {
    ignore(decode(ctx, 0, 0, retention~))
    ("none", -1)
  } catch {
    error => (error.code(), error.offset())
  }
  (outcome.0, outcome.1, ctx.next, ctx.remaining, ctx.payload, work.remaining)
}

///|
test "discarded key ranges retain duplicate and pointer failure order" {
  for
    (bytes, code, offset) in [
      (b"\xe2\x41x\x41a\x20\x01\x41b", "duplicate-key", 5),
      (b"\xe2\x42\xc3\xa9\x40\x42\xc3\xa9\x40", "duplicate-key", 5),
      (b"\xe2\x40\x40\x40\x40", "duplicate-key", 3),
      (b"\xe1\x42\xc0\x80\x40", "invalid-utf8", 2),
      (b"\xe2\x41x\x41\xff\x20\x01\x40", "invalid-utf8", 4),
      (b"\xe1\xe1\x41k\x41v\x40", "invalid-map-key", 1),
      (b"\xe1\x01\x04\x41x\x40", "invalid-map-key", 1),
      (b"\xe2\x41x\x40\x20\x06\x20\x01", "pointer-to-pointer", 4),
    ] {
    let full = key_validation_signature(bytes, All)
    assert_eq(full.0, code)
    assert_eq(full.1, offset)
    assert_eq(key_validation_signature(bytes, Discard), full)
  }
  // BOM is part of a key, and Unicode normalization is not performed.
  for
    bytes in [
      b"\xe2\x44\xef\xbb\xbfa\x40\x41a\x40", b"\xe2\x42\xc3\xa9\x40\x43e\xcc\x81\x40",
      b"\xe2\x41x\x41a\x41y\x20\x01",
    ] {
    let full = key_validation_signature(bytes, All)
    assert_eq(full.0, "none")
    assert_eq(key_validation_signature(bytes, Discard), full)
  }
}

///|
test "discarded map key thresholds preserve counters and errors" {
  for count in [0, 1, 16, 17] {
    for duplicate in [false, true] {
      let bytes = Bytes::makei(1 + count * 3, fn(i) {
        if i == 0 {
          return (224 + count).to_byte()
        }
        match (i - 1) % 3 {
          0 => b'\x41'
          1 =>
            if duplicate && i == 2 + (count - 1) * 3 {
              b'A'
            } else {
              (65 + (i - 1) / 3).to_byte()
            }
          _ => b'\x40'
        }
      })
      let full = key_validation_signature(bytes, All)
      assert_eq(
        full.0,
        if duplicate && count > 1 {
          "duplicate-key"
        } else {
          "none"
        },
      )
      assert_eq(key_validation_signature(bytes, Discard), full)
    }
  }
}

///|
test "discarded key ranges do not evade decode payload depth or operation budgets" {
  let bytes = b"\xe2\x41a\xe1\x41x\x41v\x41b\x20\x03"
  for
    limits in [
      Limits::default(),
      { ..Limits::default(), max_values: 3, },
      { ..Limits::default(), max_payload_bytes: 2, },
      { ..Limits::default(), max_depth: 1, },
    ] {
    for max_work in [1, 3, 10, 100] {
      assert_eq(
        key_validation_signature(bytes, Discard, limits~, max_work~),
        key_validation_signature(bytes, All, limits~, max_work~),
      )
    }
  }
}
