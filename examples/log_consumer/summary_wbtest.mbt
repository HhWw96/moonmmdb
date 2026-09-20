///|
test "public API consumer preserves missing and failed queries in aggregation" {
  let reader = @mmdb.open_bytes(asn_fixture())
  let result = summarize(reader, [
    "1.0.0.1", "1.0.0.2", "1.128.0.1", "255.255.255.255", "invalid",
  ])
  let expected : Json = {
    "found": 3,
    "not_found": 1,
    "errors": 1,
    "found_without_asn": 0,
    "asn_counts": { "15169": 2, "1221": 1 },
  }
  assert_eq(result, expected)
}
