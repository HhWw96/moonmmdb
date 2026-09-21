///|
// Tiny hand-specified graphs, independent of production encoders. All data
// terminals reference a text scalar; physical orphan nodes are deliberate.
fn graph_reader(
  edges : Array[(UInt, UInt)],
  ipv? : Int = 4,
  payload? : Bytes = b"\x41x",
) -> Reader raise MmdbError {
  let original = open_bytes(fixture_ipv4_24())
  let tree_end = edges.length() * 6
  let data = Bytes::makei(tree_end + 16 + payload.length(), i => {
    if i >= tree_end + 16 {
      payload[i - tree_end - 16]
    } else if i >= tree_end {
      b'\x00'
    } else {
      let pair = edges[i / 6]
      let value = if i % 6 < 3 { pair.0 } else { pair.1 }
      ((value >> ((2 - i % 3) * 8)) & 255).to_byte()
    }
  })
  {
    ..original,
    data,
    tree_end,
    data_end: data.length(),
    meta: {
      ..original.meta,
      node_count: edges.length().reinterpret_as_uint(),
      record_size: 24,
      ip_version: ipv,
    },
  }
}

///|
test "networks exact official layouts clipping ordering and misses" {
  for bytes in [fixture_ipv4_24(), fixture_ipv4_28(), fixture_ipv4_32()] {
    let reader = open_bytes(bytes)
    let cursor = reader.networks("1.1.1.0/30")
    let names = []
    while cursor.next() is Some(record) {
      names.push(record.network)
      assert_eq(
        record.value,
        reader.lookup(record.network.split("/").to_array()[0].to_owned()).value.unwrap(),
      )
    }
    assert_eq(names, ["1.1.1.1/32", "1.1.1.2/31"])
    assert_eq(cursor.next(), None)
    let clipped = reader.networks("1.1.1.3/32")
    assert_eq(clipped.next().unwrap().network, "1.1.1.3/32")
    assert_eq(clipped.next(), None)
    assert_eq(reader.networks("255.255.255.255/32").next(), None)
  }
}

///|
test "CIDR strict parsing and canonical IPv6" {
  let reader = open_bytes(fixture_ipv4_24())
  for
    text in [
      "", "1.1.1.1", "1.1.1.1/31", "0.0.0.0/33", "0.0.0.0/-1", "0.0.0.0/00", "0.0.0.0/1/2",
      "::1/0", "::/129",
    ] {
    let code = try {
      ignore(reader.networks(text))
      "ok"
    } catch {
      e => e.code()
    }
    assert_eq(code, "invalid-cidr")
  }
  assert_eq(
    try {
      ignore(reader.networks("::/0"))
      "ok"
    } catch {
      e => e.code()
    },
    "ip-version-mismatch",
  )
  assert_eq(network_text(Array::make(16, 0), 0), "::/0")
  assert_eq(
    network_text(parse_ip("2001:0db8:0:0:1:0:0:1").bytes, 128),
    "2001:db8::1:0:0:1/128",
  )
}

///|
test "IPv6 aliases are real paths and IPv4 is a separate view" {
  for bytes in [fixture_mixed_24(), fixture_mixed_28(), fixture_mixed_32()] {
    let reader = open_bytes(bytes)
    for
      text in [
        "::ffff:101:101/128", "2002:101:101::/128", "::101:101/128", "1.1.1.1/32",
      ] {
      let (addr, prefix) = cidr(text)
      let record = reader.networks(text).next().unwrap()
      assert_eq(record.network, network_text(addr.bytes, prefix))
      assert_eq(
        record.value,
        reader.lookup(text.split("/").to_array()[0].to_owned()).value.unwrap(),
      )
    }
  }
}

///|
test "shared subtrees are not cycles and record limit is sticky" {
  let reader = graph_reader([(1, 1), (18, 2)])
  let cursor = reader.networks("0.0.0.0/0")
  assert_eq(cursor.next().unwrap().network, "0.0.0.0/2")
  assert_eq(cursor.next().unwrap().network, "128.0.0.0/2")
  assert_eq(cursor.next(), None)
  let limited = reader.networks("0.0.0.0/0", limits={
    max_records: 1,
    max_work: 100,
  })
  ignore(limited.next())
  for _ in 0..<2 {
    assert_eq(
      try {
        ignore(limited.next())
        "ok"
      } catch {
        e => e.code()
      },
      "record-limit",
    )
  }
  limited.close()
  assert_eq(
    try {
      ignore(limited.next())
      "ok"
    } catch {
      e => e.code()
    },
    "record-limit",
  )
  let exact = graph_reader([(17, 1)]).networks("0.0.0.0/0", limits={
    max_records: 1,
    max_work: 100,
  })
  ignore(exact.next())
  assert_eq(exact.next(), None)
}

///|
test "work budgets include payload before allocation and persist across next" {
  let payload = Bytes::makei(67, i => {
    if i == 0 {
      b'\x5d'
    } else if i == 1 {
      b'\x24'
    } else {
      b'x'
    }
  })
  let reader = graph_reader([(17, 17)], payload~)
  let exact = reader.networks("0.0.0.0/1", limits={
    max_records: 1,
    max_work: 4,
  })
  ignore(exact.next())
  assert_eq(exact.work_used(), 4)
  assert_eq(exact.next(), None)
  let limited = reader.networks("0.0.0.0/0", limits={
    max_records: 10,
    max_work: 5,
  })
  ignore(limited.next())
  assert_eq(
    try {
      ignore(limited.next())
      "ok"
    } catch {
      e => e.code()
    },
    "work-limit",
  )
  assert_eq(
    try {
      ignore(limited.next())
      "ok"
    } catch {
      e => e.code()
    },
    "work-limit",
  )
}

///|
test "cursor cancellation and returned values do not affect other cursors" {
  let reader = open_bytes(fixture_ipv4_24())
  let a = reader.networks("1.1.1.0/24")
  let b = reader.networks("1.1.1.0/24")
  let record = a.next().unwrap()
  if record.value is Object(items) {
    items.clear()
  }
  a.close()
  a.close()
  assert_eq(a.next(), None)
  assert_eq(b.next().unwrap().value.get("ip"), Some(Text("1.1.1.1")))
}

///|
test "validation checks physical orphan pointers cycles and depth" {
  let shared = graph_reader([(1, 1), (19, 3), (3, 3)])
  let report = shared.validate(decode_data=true)
  assert_eq(report.checked_nodes, 3)
  assert_eq(report.reachable_nodes, 2)
  assert_eq(report.unreachable_nodes, 1)
  assert_eq(report.decoded_records, 1)
  for edges in [[(18U, 2U), (3U, 2U)], [(18U, 2U), (1U, 2U)], [(0U, 1U)]] {
    let reader = graph_reader(edges)
    let code = try {
      ignore(reader.validate())
      "ok"
    } catch {
      e => e.code()
    }
    assert_true(code == "invalid-tree-pointer" || code == "tree-cycle")
  }
  let chain = Array::makei(33, i => ((i + 1).reinterpret_as_uint(), 33U))
  let reader = graph_reader(chain)
  assert_eq(
    try {
      ignore(reader.validate())
      "ok"
    } catch {
      e => e.code()
    },
    "invalid-tree",
  )
  assert_eq(
    try {
      let cursor = reader.networks("0.0.0.0/0")
      ignore(cursor.next())
      "ok"
    } catch {
      e => e.code()
    },
    "invalid-tree",
  )
}

///|
test "validation decode policy empty graph and exact state boundaries" {
  let empty = graph_reader([])
  assert_eq(empty.validate().checked_nodes, 0)
  assert_eq(empty.networks("0.0.0.0/0").next(), None)
  let malformed = graph_reader([(17, 1)], payload=b"\x41\xff")
  ignore(malformed.validate())
  assert_eq(
    try {
      ignore(malformed.validate(decode_data=true))
      "ok"
    } catch {
      e => e.code()
    },
    "invalid-utf8",
  )
  let report = graph_reader([(17, 1)]).validate(decode_data=true)
  assert_eq(report.peak_state_bytes, 7)
  ignore(
    graph_reader([(17, 1)]).validate(decode_data=true, limits={
      max_work: 100,
      max_state_bytes: 7,
    }),
  )
  assert_eq(
    try {
      ignore(
        graph_reader([(17, 1)]).validate(decode_data=true, limits={
          max_work: 100,
          max_state_bytes: 6,
        }),
      )
      "ok"
    } catch {
      e => e.validation_status()
    },
    "incomplete",
  )
  assert_eq(
    try {
      ignore(
        graph_reader([(17, 1)]).validate(limits={
          max_work: 4,
          max_state_bytes: 100,
        }),
      )
      "ok"
    } catch {
      e => e.code()
    },
    "work-limit",
  )
}

///|
test "orphan deep graphs grow bounded stack and reachable path cycles fail" {
  let edges = Array::makei(301, i => {
    if i == 0 {
      (317U, 301U)
    } else {
      ((i + 1).reinterpret_as_uint(), 301U)
    }
  })
  let reader = graph_reader(edges)
  let report = reader.validate()
  assert_eq(report.reachable_nodes, 1)
  assert_eq(report.unreachable_nodes, 300)
  assert_true(report.peak_state_bytes > 301 * 2 + 128 * 4)
  assert_eq(
    try {
      ignore(
        reader.validate(limits={ max_work: 10000, max_state_bytes: 1114, }),
      )
      "ok"
    } catch {
      e => e.code()
    },
    "state-limit",
  )
  let cycle = graph_reader([(0, 1)])
  assert_eq(
    try {
      ignore(cycle.networks("0.0.0.0/32"))
      "ok"
    } catch {
      e => e.code()
    },
    "tree-cycle",
  )
  let cursor = cycle.networks("0.0.0.0/0")
  for _ in 0..<2 {
    assert_eq(
      try {
        ignore(cursor.next())
        "ok"
      } catch {
        e => e.code()
      },
      "tree-cycle",
    )
  }
  let malformed = graph_reader([(18, 2), (3, 2)], payload=b"\x41\xff")
  assert_eq(
    try {
      ignore(malformed.validate(decode_data=true))
      "ok"
    } catch {
      e => e.code()
    },
    "invalid-tree-pointer",
  )
}
