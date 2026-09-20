///|
fn state() -> Analytics {
  {
    enricher: None,
    fatal: None,
    total: 0,
    valid: 0,
    invalid: 0,
    exit_code: 0,
    groups: [Map([]), Map([])],
    counts: [Counts::new(), Counts::new()],
  }
}

///|
fn row(country : String, asn : UInt) -> @mmdb.Enrichment {
  {
    sources: [
      (
        "geo",
        Selected({
          record_found: true,
          prefix_length: 24,
          fields: [("/country/iso_code", Some(Text(country)))],
        }),
      ),
      (
        "asn",
        Selected({
          record_found: true,
          prefix_length: 24,
          fields: [("/autonomous_system_number", Some(Unsigned32(asn)))],
        }),
      ),
    ],
  }
}

///|
test "analysis counts exact values and sorts ties deterministically" {
  let s = state()
  s.accept(row("GB", 9))
  s.accept(row("CN", 10))
  s.accept(row("GB", 10))
  s.analytics_invalid()
  assert_eq(s.valid, 3)
  assert_eq(s.invalid, 1)
  assert_eq(s.groups[0].get("GB"), Some(2))
  s.groups[0]["CN"] = 9007199254740993
  assert_true(s.analytics_result().contains("9007199254740993"))
  let groups : Map[String, UInt64] = Map([("z", 2), ("a", 2)])
  assert_eq(
    top(groups).stringify(),
    "[{\"key\":\"a\",\"count\":\"2\"},{\"key\":\"z\",\"count\":\"2\"}]",
  )
}

///|
test "analysis bounds group cardinality and freezes after fatal error" {
  let s = state()
  for i in 0..<10000 {
    s.accept(row("country-" + i.to_string(), 7))
  }
  assert_eq(s.groups[0].length(), 10000)
  s.accept(row("overflow", 7))
  assert_true(s.analytics_status().contains("group-limit"))
  let total = s.total
  s.analytics_invalid()
  assert_eq(s.total, total)
  assert_eq(s.groups[0].length(), 10000)
}

///|
test "analysis keeps missing fields and missing records separate" {
  let s = state()
  s.accept({
    sources: [
      (
        "geo",
        Selected({
          record_found: false,
          prefix_length: 0,
          fields: [("/country/iso_code", None)],
        }),
      ),
      (
        "asn",
        Selected({
          record_found: true,
          prefix_length: 24,
          fields: [("/autonomous_system_number", None)],
        }),
      ),
    ],
  })
  assert_eq(s.counts[0].not_found, 1)
  assert_eq(s.counts[0].missing, 1)
  assert_eq(s.counts[1].found, 1)
  assert_eq(s.counts[1].missing, 1)
  assert_eq(s.exit_code, 1)
}

///|
test "analysis treats an unexpected schema type as an error rather than missing" {
  let s = state()
  s.accept({
    sources: [
      (
        "geo",
        Selected({
          record_found: true,
          prefix_length: 24,
          fields: [("/country/iso_code", Some(Boolean(true)))],
        }),
      ),
      (
        "asn",
        Selected({
          record_found: true,
          prefix_length: 24,
          fields: [("/autonomous_system_number", Some(Text("64512")))],
        }),
      ),
    ],
  })
  assert_eq(s.counts[0].errors, 1)
  assert_eq(s.counts[1].missing, 0)
  assert_eq(s.exit_code, 2)
}
