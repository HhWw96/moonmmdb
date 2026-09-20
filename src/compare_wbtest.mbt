///|
test "comparison ignores nested map order but preserves numeric types bits and array order" {
  assert_true(
    same_value(
      Object([
        ("a", List([Object([("x", Text("yes")), ("y", Boolean(false))])])),
        ("b", Unsigned32(7)),
      ]),
      Object([
        ("b", Unsigned32(7)),
        ("a", List([Object([("y", Boolean(false)), ("x", Text("yes"))])])),
      ]),
    ),
  )
  assert_true(!same_value(Unsigned16(7), Unsigned32(7)))
  assert_true(!same_value(Real32({ bits: 0, }), Real32({ bits: 0x80000000, })))
  assert_true(
    same_value(Real32({ bits: 0x7f800001, }), Real32({ bits: 0x7f800001, })),
  )
  assert_true(
    !same_value(List([Text("a"), Text("b")]), List([Text("b"), Text("a")])),
  )
  assert_true(
    !same_value(Object([("a", Text("x"))]), Object([("b", Text("x"))])),
  )
}

///|
test "comparison is independent of 24 28 and 32 bit storage layouts" {
  let before = open_bytes(fixture_ipv4_24())
  let selector = prepare_fields(["", "/ip", "/absent"])
  for data in [fixture_ipv4_28(), fixture_ipv4_32()] {
    let after = open_bytes(data)
    for ip in ["1.1.1.1", "1.1.1.3", "255.255.255.255"] {
      assert_true(!before.compare_prepared(after, ip, selector).changed())
    }
  }
}

///|
test "comparison reports actual field changes and excludes unselected fields" {
  let original = fixture_ipv4_24()
  let before = open_bytes(original)
  let bytes = original.to_array()
  let needle = b"1.1.1.2"
  let mut changed = false
  for i = before.tree_end + 16
      i + needle.length() <= before.data_end
      i = i + 1 {
    let mut matches = true
    for j in 0..<needle.length() {
      if original[i + j] != needle[j] {
        matches = false
        break
      }
    }
    if matches {
      bytes[i] = 57
      changed = true
      break
    }
  }
  assert_true(changed)
  let after = open_bytes(Bytes::from_array(bytes))
  let result = before.compare(after, "1.1.1.3", ["/ip", "/absent"])
  assert_true(result.changed())
  assert_eq(result.changed_fields, ["/ip"])
  assert_true(!result.prefix_changed && !result.record_changed)
  assert_eq(result.after.fields[0].1, Some(Text("9.1.1.2")))
  assert_true(!before.compare(after, "1.1.1.3", ["/absent"]).changed())
  assert_true(!before.compare(after, "1.1.1.1", ["/ip"]).changed())
}

///|
test "comparison distinguishes prefix changes record addition removal and missing fields" {
  let present : Projection = {
    record_found: true,
    prefix_length: 24,
    fields: [("/absent", None)],
  }
  let absent : Projection = {
    record_found: false,
    prefix_length: 24,
    fields: [("/absent", None)],
  }
  assert_true(diff_projections(present, absent).record_changed)
  assert_true(diff_projections(absent, present).record_changed)
  assert_true(!diff_projections(absent, absent).changed())
  let prefix_only = diff_projections(present, { ..present, prefix_length: 25, })
  assert_true(prefix_only.changed() && prefix_only.prefix_changed)
  assert_eq(prefix_only.changed_fields, [])
  let real = open_bytes(fixture_ipv4_24()).compare(
    open_bytes(fixture_ipv6_24()),
    "1.1.1.1",
    ["/ip"],
  )
  assert_true(real.record_changed)
  assert_true(real.before.record_found && !real.after.record_found)
}

///|
test "comparison enforces both reader budgets and identifies the failing side" {
  let reader = open_bytes(fixture_decoder())
  let limited = { ..reader, limits: { ..Limits::default(), max_values: 1, }, }
  let selector = prepare_fields(["/absent"])
  let before = try {
    ignore(limited.compare_prepared(reader, "1.1.1.3", selector))
    "none"
  } catch {
    e => e.message()
  }
  let after = try {
    ignore(reader.compare_prepared(limited, "1.1.1.3", selector))
    "none"
  } catch {
    e => e.message()
  }
  assert_true(before.has_prefix("before database:"))
  assert_true(after.has_prefix("after database:"))
  let invalid = try {
    ignore(reader.compare(reader, "bad-ip", ["/ip"]))
    "none"
  } catch {
    e => e.code()
  }
  assert_eq(invalid, "invalid-ip")
}
