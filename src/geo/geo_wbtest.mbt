///|
test "ASN handles exact unsigned range and missing fields" {
  let record = AsnRecord::from_value(
    @mmdb.Object([
      ("autonomous_system_number", @mmdb.Unsigned32(4294967295U)),
      ("autonomous_system_organization", @mmdb.Text("运营商")),
      ("future_field", @mmdb.Boolean(true)),
    ]),
  )
  assert_eq(record.autonomous_system_number, Some(4294967295U))
  assert_eq(record.autonomous_system_organization, Some("运营商"))
  assert_eq(
    AsnRecord::from_value(@mmdb.Object([])).autonomous_system_number,
    None,
  )
  assert_eq(
    AsnRecord::from_value(
      @mmdb.Object([("autonomous_system_number", @mmdb.Unsigned64(15169UL))]),
    ).autonomous_system_number,
    Some(15169U),
  )
}

///|
test "ASN rejects signed strings and overflowing integers with field paths" {
  for
    value in [
      @mmdb.Text("15169"),
      @mmdb.Signed32(-1),
      @mmdb.Unsigned64(4294967296UL),
      @mmdb.Boolean(false),
    ] {
    let error = try {
      ignore(
        AsnRecord::from_value(
          @mmdb.Object([("autonomous_system_number", value)]),
        ),
      )
      None
    } catch {
      e => Some(e)
    }
    assert_eq(error.unwrap().code(), "schema-mismatch")
    assert_eq(error.unwrap().path(), Some("/autonomous_system_number"))
  }
}

///|
test "City localization subdivisions and snapshots" {
  let localized : Array[(String, @mmdb.Value)] = [
    ("en", @mmdb.Text("Example")),
    ("zh-CN", @mmdb.Text("示例")),
  ]
  let subdivisions : Array[@mmdb.Value] = [
    @mmdb.Object([
      ("iso_code", @mmdb.Text("A")),
      ("names", @mmdb.Object(localized)),
    ]),
  ]
  let value = @mmdb.Object([
    (
      "country",
      @mmdb.Object([
        ("iso_code", @mmdb.Text("ZZ")),
        ("names", @mmdb.Object(localized)),
        ("is_in_european_union", @mmdb.Boolean(false)),
      ]),
    ),
    (
      "city",
      @mmdb.Object([
        ("geoname_id", @mmdb.Unsigned32(1)),
        ("names", @mmdb.Object(localized)),
      ]),
    ),
    ("subdivisions", @mmdb.List(subdivisions)),
    ("postal", @mmdb.Object([("code", @mmdb.Text("00100"))])),
    (
      "location",
      @mmdb.Object([
        ("latitude", @mmdb.Real64({ bits: 45.5.reinterpret_as_uint64(), })),
        (
          "longitude",
          @mmdb.Real64({ bits: (-120.25).reinterpret_as_uint64(), }),
        ),
        ("time_zone", @mmdb.Text("Etc/UTC")),
      ]),
    ),
  ])
  let first = CityRecord::from_value(value)
  assert_eq(first.country.unwrap().names.get("zh-CN"), Some("示例"))
  assert_eq(first.country.unwrap().names.get("de"), None)
  assert_eq(first.location.unwrap().latitude, Some(45.5))
  assert_eq(first.postal_code, Some("00100"))
  first.country.unwrap().names["en"] = "changed"
  first.subdivisions.clear()
  let next = CityRecord::from_value(value)
  assert_eq(next.country.unwrap().names.get("en"), Some("Example"))
  assert_eq(next.subdivisions.length(), 1)
  localized[0] = ("en", @mmdb.Text("caller mutation"))
  assert_eq(next.city.unwrap().names.get("en"), Some("Example"))
}

///|
test "City distinguishes absent containers from invalid shapes" {
  let empty = CityRecord::from_value(@mmdb.Object([]))
  assert_eq(empty.country, None)
  assert_eq(empty.location, None)
  assert_eq(empty.subdivisions.length(), 0)
  for
    pair in [
      ("country", @mmdb.Text("US")),
      ("city", @mmdb.List([])),
      ("subdivisions", @mmdb.Object([])),
      ("location", @mmdb.Boolean(false)),
    ] {
    let code = try {
      ignore(CityRecord::from_value(@mmdb.Object([pair])))
      "none"
    } catch {
      e => e.code()
    }
    assert_eq(code, "schema-mismatch")
  }
  let path = try {
    ignore(
      CityRecord::from_value(
        @mmdb.Object([("subdivisions", @mmdb.List([@mmdb.Text("bad")]))]),
      ),
    )
    None
  } catch {
    e => e.path()
  }
  assert_eq(path, Some("/subdivisions/0"))
}

///|
test "City rejects invalid coordinate ranges NaN and malformed names" {
  for
    number in [
      91.0,
      -91.0,
      0x7ff0000000000000UL.reinterpret_as_double(),
      0x7ff8000000000000UL.reinterpret_as_double(),
    ] {
    let code = try {
      ignore(
        CityRecord::from_value(
          @mmdb.Object([
            (
              "location",
              @mmdb.Object([
                (
                  "latitude",
                  @mmdb.Real64({ bits: number.reinterpret_as_uint64(), }),
                ),
              ]),
            ),
          ]),
        ),
      )
      "none"
    } catch {
      e => e.code()
    }
    assert_eq(code, "schema-mismatch")
  }
  let code = try {
    ignore(
      CityRecord::from_value(
        @mmdb.Object([
          (
            "city",
            @mmdb.Object([
              ("names", @mmdb.Object([("en", @mmdb.Unsigned16(7))])),
            ]),
          ),
        ]),
      ),
    )
    "none"
  } catch {
    e => e.code()
  }
  assert_eq(code, "schema-mismatch")
}

///|
test "Official City and ASN fixtures work through the public Reader" {
  let asn = lookup_asn(@mmdb.open_bytes(asn_fixture()), "1.0.0.1")
  assert_eq(asn.record.unwrap().autonomous_system_number, Some(15169U))
  assert_eq(asn.prefix_length, 24)
  assert_eq(lookup_asn(@mmdb.open_bytes(asn_fixture()), "0.0.0.0").record, None)
  let city = lookup_city(@mmdb.open_bytes(city_fixture()), "2001:218::")
  assert_eq(city.record.unwrap().country.unwrap().iso_code, Some("JP"))
  let reader = @mmdb.open_bytes(asn_fixture())
  let code = try {
    ignore(lookup_asn(reader, "invalid"))
    "none"
  } catch {
    e => e.code()
  }
  assert_eq(code, "invalid-ip")
}

///|
test "Typed adapter rejects a scalar root with an empty root pointer" {
  let error = try {
    ignore(AsnRecord::from_value(@mmdb.Text("bad")))
    None
  } catch {
    e => Some(e)
  }
  assert_eq(error.unwrap().path(), Some(""))
  assert_true(error.unwrap().message().contains("object"))
}

///|
test "Typed queries retain independent Reader resource limits" {
  let reader = @mmdb.open_bytes(city_fixture(), limits={
    ..@mmdb.Limits::default(),
    max_values: 60,
  })
  let code = try {
    ignore(lookup_city(reader, "2001:218::"))
    "none"
  } catch {
    e => {
      assert_eq(e.path(), None)
      e.code()
    }
  }
  assert_eq(code, "value-limit")
}
