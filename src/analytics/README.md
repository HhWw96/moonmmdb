# Request analytics

Optional `HhWw96/moonmmdb/analytics` package. No network, files, clock, or logging dependencies.
Import the root reader and this package in `moon.pkg`:

```moonbit
import {
  "HhWw96/moonmmdb" @mmdb,
  "HhWw96/moonmmdb/analytics",
}
```

Given two already opened readers:

```moonbit
let analyzer = @analytics.Analyzer::new(city, asn)
analyzer.push("1.1.1.1")
analyzer.invalid_input() // one malformed log row supplied by the host
let report = analyzer.finish()
let json = report.to_json().stringify()
analyzer.close()
```

`push` counts invalid IP syntax as invalid input. Each valid IP contributes to exactly one of
`counted`, `not_found`, `missing_field`, `type_error`, `query_error` in each dimension.
Country accepts MMDB text; ASN accepts unsigned 16/32/64-bit integers, preserving exact decimal keys.
The package counts requests, not unique addresses or people. No geolocation accuracy is implied.

`AnalyticsLimits { top: 10, max_groups: 10000 }` defaults apply. `top` is 1..100 and
`max_groups` is 1..10000 per dimension. Keys are limited to 256 UTF-8 bytes. Counts are
checked UInt64 integers; JSON counters are decimal strings. Ties use UTF-16 string lexicographic
order, matching MoonBit/JavaScript string ordering, not numeric ASN ordering.

`finish` seals input; repeating it returns isolated report arrays. `close` releases readers and
groups, and may be repeated. Fatal budget/overflow errors are sticky and no partial report is
returned. Query errors remain counts. Old `examples/log_analytics` semantics are unchanged.

CLI provenance, raw input hashing, exit rules and reproducible examples: [analytics guide](../../docs/ANALYTICS.md).
