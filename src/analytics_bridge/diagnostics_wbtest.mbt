///|
test "bounded diagnostics isolate caller objects and count omitted abnormal rows" {
  let buffer = DiagnosticBuffer::new(1)
  let issues : Array[Json] = [
    { "dimension": "country", "category": "not_found" },
  ]
  let value : Json = { "input": "valid", "issues": issues.to_json() }
  buffer.add(value, 1, 0, 10)
  issues.clear()
  buffer.add({ "input": "missing-ip", "issues": [] }, 2, 10, 13)
  buffer.add({ "input": "valid", "issues": [] }, 3, 13, 20)
  let first = buffer.to_json()
  match first {
    { "retained": "1", "omitted": "1", "rows": Array(rows), .. } => {
      match rows[0] {
        { "outcome": { "issues": Array(stored), .. }, .. } =>
          assert_eq(stored.length(), 1)
        _ => abort("missing retained issue")
      }
      rows.clear()
    }
    _ => abort("unexpected diagnostic counts")
  }
  match buffer.to_json() {
    { "rows": Array(rows), .. } => assert_eq(rows.length(), 1)
    _ => abort("missing retained row")
  }
}

///|
test "byte capacity seals diagnostics rather than selecting later smaller rows" {
  let buffer = DiagnosticBuffer::new(1000)
  buffer.add(
    {
      "input": "valid",
      "issues": [
        {
          "dimension": "country",
          "category": "query_error",
          "code": "x".repeat(524288),
        },
      ],
    },
    1,
    0,
    1,
  )
  buffer.add({ "input": "missing-ip", "issues": [] }, 2, 1, 2)
  match buffer.to_json() {
    { "retained": "0", "omitted": "2", .. } => ()
    _ => abort("diagnostic capacity must be sticky")
  }
}
