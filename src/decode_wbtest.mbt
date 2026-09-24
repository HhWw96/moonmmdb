///|
fn decode_sample(
  bytes : Bytes,
  limits? : Limits = Limits::default(),
) -> Value raise MmdbError {
  decode(decoder(bytes, 0, bytes.length(), limits), 0, 0).0
}

///|
test "duplicate detection is unchanged across small-map optimization threshold" {
  for count in [16, 17] {
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
      if duplicate {
        decode_error(bytes, "duplicate-key")
      } else {
        match decode_sample(bytes) {
          Object(items) => assert_eq(items.length(), count)
          _ => abort("map expected")
        }
      }
    }
  }
}

///|
fn decode_error(
  bytes : Bytes,
  code : String,
  limits? : Limits = Limits::default(),
) -> Unit raise {
  let actual = try {
    ignore(decode_sample(bytes, limits~))
    "no-error"
  } catch {
    e => e.code()
  }
  assert_eq(actual, code)
}

///|
test "all numeric types retain width sign precision and floating bits" {
  assert_eq(decode_sample(b"\xa2\xff\xff"), Unsigned16(65535))
  assert_eq(decode_sample(b"\xc4\xff\xff\xff\xff"), Unsigned32(4294967295))
  assert_eq(decode_sample(b"\x04\x01\xff\xff\xff\xff"), Signed32(-1))
  assert_eq(decode_sample(b"\x03\x01\xff\xff\xff"), Signed32(16777215))
  assert_eq(
    decode_sample(b"\x08\x02\xff\xff\xff\xff\xff\xff\xff\xff"),
    Unsigned64(18446744073709551615),
  )
  assert_eq(
    decode_sample(
      b"\x10\x03\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff",
    ),
    Unsigned128("340282366920938463463374607431768211455"),
  )
  assert_eq(decode_sample(b"\x00\x03"), Unsigned128("0"))
  assert_eq(
    decode_sample(b"\x68\x3f\xf0\x00\x00\x00\x00\x00\x00"),
    Real64({ bits: 0x3ff0000000000000, }),
  )
  assert_eq(
    decode_sample(b"\x04\x08\x3f\x80\x00\x00"),
    Real32({ bits: 0x3f800000, }),
  )
  let json = decode_sample(b"\x68\x80\x00\x00\x00\x00\x00\x00\x00").to_tagged_json()
  assert_true(json.stringify().contains("8000000000000000"))
}

///|
test "UTF8 bytes booleans and nested containers remain distinct" {
  assert_eq(decode_sample(b"\x43\xe4\xb8\xad"), Text("中"))
  assert_eq(decode_sample(b"\x43\xef\xbb\xbf"), Text("\u{feff}"))
  assert_eq(decode_sample(b"\x82\x00\xff"), Blob(b"\x00\xff"))
  assert_eq(decode_sample(b"\x00\x07"), Boolean(false))
  assert_eq(decode_sample(b"\x01\x07"), Boolean(true))
  assert_eq(
    decode_sample(b"\xe1\x41k\x02\x04\x40\xc0"),
    Object([("k", List([Text(""), Unsigned32(0)]))]),
  )
}

///|
test "invalid scalar lengths UTF8 keys and truncation report errors" {
  for bytes in [b"\x67", b"\x03\x08", b"\xa3\x00\x00\x00", b"\x02\x07"] {
    decode_error(bytes, "invalid-size")
  }
  decode_error(b"\x41\xff", "invalid-utf8")
  decode_error(b"\x42a", "out-of-bounds")
  decode_error(b"\xe1\xc0\x40", "invalid-map-key")
  decode_error(b"\xe2\x41a\x40\x41a\x40", "duplicate-key")
  decode_error(b"\x00\x05", "unsupported-type")
}

///|
test "pointer sizes and local section bases" {
  assert_eq(decode_sample(b"\x20\x04\x00\x00\x41x"), Text("x"))
  assert_eq(decode_sample(b"\x3f\x00\x00\x00\x06\x00\x41x"), Text("x"))
  let medium = Bytes::makei(2050, i => {
    if i == 0 {
      0x28
    } else if i == 2048 {
      0x41
    } else if i == 2049 {
      120
    } else {
      0
    }
  })
  assert_eq(decode_sample(medium), Text("x"))
  let large = Bytes::makei(526338, i => {
    if i == 0 {
      0x30
    } else if i == 526336 {
      0x41
    } else if i == 526337 {
      120
    } else {
      0
    }
  })
  assert_eq(decode_sample(large), Text("x"))
  let bytes = b"padding\x20\x04\x00\x00\x41x"
  assert_eq(
    decode(decoder(bytes, 7, bytes.length(), Limits::default()), 7, 0).0,
    Text("x"),
  )
}

///|
test "pointer and container failures are bounded" {
  decode_error(b"\x20\xff", "out-of-bounds")
  decode_error(b"\x20\x02\x20\x00", "pointer-to-pointer")
  decode_error(b"\x01\x04\x20\x00", "pointer-cycle")
  decode_error(b"\x1f\x04\xff\xff\xff", "value-limit")
  let small = { ..Limits::default(), max_payload_bytes: 2, }
  decode_error(b"\x43abc", "payload-limit", limits=small)
  let shallow = { ..Limits::default(), max_depth: 1, }
  decode_error(b"\x01\x04\x01\x04\x40", "depth-limit", limits=shallow)
  let work = { ..Limits::default(), max_values: 4, }
  decode_error(b"\x02\x04\x01\x04\x40\x01\x04\x40", "value-limit", limits=work)
}

///|
test "signaling NaN payload bits survive decoding and JSON output" {
  let single = decode_sample(b"\x04\x08\x7f\x80\x00\x01")
    .to_tagged_json()
    .stringify()
  assert_true(single.contains("7f800001"))
  let double = decode_sample(b"\x68\x7f\xf0\x00\x00\x00\x00\x00\x01")
    .to_tagged_json()
    .stringify()
  assert_true(double.contains("7ff0000000000001"))
}

///|
test "floating bit containers retain signs infinities and both NaN classes" {
  for
    bits in [
      0U, 0x80000000, 0x7f800000, 0xff800000, 0x7f800001, 0x7fc00001, 0xff800123,
    ] {
    let encoded = Bytes::from_array([
      4,
      8,
      (bits >> 24).to_byte(),
      (bits >> 16).to_byte(),
      (bits >> 8).to_byte(),
      bits.to_byte(),
    ])
    assert_eq(decode_sample(encoded), Real32({ bits, }))
    assert_true(
      decode_sample(encoded)
      .to_tagged_json()
      .stringify()
      .contains(bits.to_string(radix=16)),
    )
  }
  let one : Float32Value = { bits: 0x3f800000, }
  assert_eq(one.number(), 1.0F)
  let one : Float64Value = { bits: 0x3ff0000000000000, }
  assert_eq(one.number(), 1.0)
}

///|
test "size extension boundaries include empty and exact budget limits" {
  for size in [0, 28, 29, 284, 285, 65820, 65821] {
    let header : Array[Byte] = if size < 29 {
      [(0x40 + size).to_byte()]
    } else if size < 285 {
      [0x5d, (size - 29).to_byte()]
    } else if size < 65821 {
      [0x5e, ((size - 285) >> 8).to_byte(), (size - 285).to_byte()]
    } else {
      [0x5f, 0, 0, 0]
    }
    let data = Bytes::makei(header.length() + size, i => {
      if i < header.length() {
        header[i]
      } else {
        120
      }
    })
    assert_eq(decode_sample(data), Text("x".repeat(size)))
    if size > 0 {
      assert_eq(
        decode_sample(data, limits={
          ..Limits::default(),
          max_payload_bytes: size,
        }),
        Text("x".repeat(size)),
      )
      decode_error(data, "payload-limit", limits={
        ..Limits::default(),
        max_payload_bytes: size - 1,
      })
    }
  }
  assert_eq(
    decode_sample(b"\x02\x04\x40\x40", limits={
      ..Limits::default(),
      max_values: 3,
    }),
    List([Text(""), Text("")]),
  )
  decode_error(b"\x02\x04\x40\x40", "value-limit", limits={
    ..Limits::default(),
    max_values: 2,
  })
}
