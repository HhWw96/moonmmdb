///|
priv struct OperationWork {
  mut remaining : Int
  maximum : Int
}

///|
fn OperationWork::charge(
  self : OperationWork,
  amount : Int,
  offset : Int,
) -> Unit raise MmdbError {
  if amount > self.remaining {
    raise MmdbError("work-limit", offset, "Operation work budget exhausted")
  }
  self.remaining = self.remaining - amount
}

///|
fn operation_work(maximum : Int) -> OperationWork raise MmdbError {
  if maximum < 1 || maximum > 1000000000 {
    raise MmdbError("invalid-limits", -1, "Work limit must be 1..1000000000")
  }
  { remaining: maximum, maximum, }
}

///|
pub(all) struct TraversalLimits {
  max_records : Int
  max_work : Int
} derive(Eq, @debug.Debug)

///|
pub fn TraversalLimits::default() -> TraversalLimits {
  { max_records: 100000, max_work: 100000000, }
}

///|
pub(all) struct NetworkRecord {
  network : String
  value : Value
} derive(Eq, @debug.Debug)

///|
pub fn NetworkRecord::to_json(self : NetworkRecord) -> Json {
  { "network": self.network.to_json(), "value": self.value.to_tagged_json() }
}

///|
priv struct NetworkFrame {
  node : UInt
  depth : Int
  bytes : Array[Int]
  ancestors : Array[UInt]
}

///|
pub struct NetworkCursor {
  priv mut reader : Reader?
  priv frames : Array[NetworkFrame]
  priv work : OperationWork
  priv limits : TraversalLimits
  priv padding : Int
  priv bits : Int
  priv mut emitted : Int
  priv mut failure : MmdbError?
}

///|
fn cidr(text : String) -> (Address, Int) raise MmdbError {
  if text.length() < 3 || text.length() > 49 {
    raise MmdbError("invalid-cidr", -1, "Invalid CIDR length")
  }
  let parts = text.split("/").to_array()
  if parts.length() != 2 {
    raise MmdbError("invalid-cidr", -1, "Expected IP/prefix")
  }
  let addr = parse_ip(parts[0].to_owned()) catch {
    _ => raise MmdbError("invalid-cidr", -1, "Invalid CIDR address")
  }
  let suffix = parts[1]
  if suffix.length() < 1 ||
    suffix.length() > 3 ||
    (suffix.length() > 1 && suffix[0] == '0') {
    raise MmdbError("invalid-cidr", -1, "Invalid CIDR prefix")
  }
  let mut prefix = 0
  for ch in suffix {
    if ch < '0' || ch > '9' {
      raise MmdbError("invalid-cidr", -1, "Invalid CIDR prefix")
    }
    prefix = prefix * 10 + ch.to_int() - 48
  }
  let bits = addr.bytes.length() * 8
  if prefix > bits {
    raise MmdbError("invalid-cidr", -1, "CIDR prefix out of range")
  }
  for bit in prefix..<bits {
    if ((addr.bytes[bit / 8] >> (7 - bit % 8)) & 1) != 0 {
      raise MmdbError("invalid-cidr", -1, "CIDR host bits must be zero")
    }
  }
  (addr, prefix)
}

///|
fn network_text(bytes : Array[Int], prefix : Int) -> String {
  if bytes.length() == 4 {
    return bytes.map(n => n.to_string()).join(".") + "/" + prefix.to_string()
  }
  let groups = Array::makei(8, i => bytes[i * 2] * 256 + bytes[i * 2 + 1])
  let mut best = -1
  let mut length = 1
  let mut i = 0
  while i < 8 {
    if groups[i] != 0 {
      i = i + 1
      continue
    }
    let start = i
    while i < 8 && groups[i] == 0 {
      i = i + 1
    }
    if i - start > length {
      best = start
      length = i - start
    }
  }
  let left : Array[String] = []
  let right : Array[String] = []
  for j in 0..<8 {
    if best < 0 || j < best {
      left.push(groups[j].to_string(radix=16))
    } else if j >= best + length {
      right.push(groups[j].to_string(radix=16))
    }
  }
  (if best < 0 {
    left.join(":")
  } else {
    left.join(":") + "::" + right.join(":")
  }) +
  "/" +
  prefix.to_string()
}

///|
fn Reader::data_offset(
  self : Reader,
  node : UInt,
  at : Int,
) -> Int raise MmdbError {
  let relative = node.to_uint64() - self.meta.node_count.to_uint64()
  let offset = self.tree_end.to_uint64() + relative
  if relative < 16 || offset >= self.data_end.to_uint64() {
    raise MmdbError(
      "invalid-tree-pointer", at, "Search record points outside data",
    )
  }
  offset.to_int()
}

///|
pub fn Reader::networks(
  self : Reader,
  text : String,
  limits? : TraversalLimits = TraversalLimits::default(),
) -> NetworkCursor raise MmdbError {
  let work = operation_work(limits.max_work)
  if limits.max_records < 1 || limits.max_records > 1000000 {
    raise MmdbError("invalid-limits", -1, "Record limit must be 1..1000000")
  }
  let (addr, prefix) = cidr(text)
  if addr.version == 6 && self.meta.ip_version == 4 {
    raise MmdbError(
      "ip-version-mismatch", -1, "IPv6 CIDR against IPv4 database",
    )
  }
  let bits = if self.meta.ip_version == 4 { 32 } else { 128 }
  let padding = if addr.version == 4 && bits == 128 { 96 } else { 0 }
  let mut node : UInt = 0
  let ancestors : Array[UInt] = []
  for depth in 0..<(padding + prefix) {
    if node >= self.meta.node_count {
      break
    }
    if ancestors.contains(node) {
      raise MmdbError(
        "tree-cycle",
        node.reinterpret_as_int() * (self.meta.record_size / 4),
        "Cycle in search path",
      )
    }
    ancestors.push(node)
    let bit = if depth < padding {
      0
    } else {
      (addr.bytes[(depth - padding) / 8] >> (7 - (depth - padding) % 8)) & 1
    }
    work.charge(1, node.reinterpret_as_int() * (self.meta.record_size / 4))
    node = self.branch(node, bit)
  }
  {
    reader: Some(self),
    frames: [{ node, depth: padding + prefix, bytes: addr.bytes, ancestors, }],
    work,
    limits,
    padding,
    bits,
    emitted: 0,
    failure: None,
  }
}

///|
pub fn NetworkCursor::close(self : NetworkCursor) -> Unit {
  self.reader = None
  self.frames.clear()
}

///|
pub fn NetworkCursor::emitted_count(self : NetworkCursor) -> Int {
  self.emitted
}

///|
pub fn NetworkCursor::work_used(self : NetworkCursor) -> Int {
  self.work.maximum - self.work.remaining
}

///|
fn NetworkCursor::advance(
  self : NetworkCursor,
  reader : Reader,
) -> NetworkRecord? raise MmdbError {
  while self.frames.pop() is Some(frame) {
    let node = frame.node
    if node == reader.meta.node_count {
      continue
    }
    if node > reader.meta.node_count {
      if self.emitted >= self.limits.max_records {
        raise MmdbError("record-limit", -1, "Network record limit exhausted")
      }
      let offset = reader.data_offset(node, -1)
      let ctx = decoder(
        reader.data,
        reader.tree_end + 16,
        reader.data_end,
        reader.limits,
        work=Some(self.work),
      )
      let (value, _) = decode(ctx, offset, 0)
      self.emitted = self.emitted + 1
      return Some({
        network: network_text(frame.bytes, frame.depth - self.padding),
        value,
      })
    }
    let at = node.reinterpret_as_int() * (reader.meta.record_size / 4)
    if frame.ancestors.contains(node) {
      raise MmdbError("tree-cycle", at, "Cycle in search path")
    }
    if frame.depth >= self.bits {
      raise MmdbError(
        "invalid-tree", at, "Search has no terminal after all address bits",
      )
    }
    let ancestors = frame.ancestors.copy()
    ancestors.push(node)
    let right = frame.bytes.copy()
    let bit = frame.depth - self.padding
    right[bit / 8] = right[bit / 8] | (1 << (7 - bit % 8))
    self.work.charge(2, at)
    self.frames.push({
      node: reader.branch(node, 1),
      depth: frame.depth + 1,
      bytes: right,
      ancestors,
    })
    self.frames.push({
      node: reader.branch(node, 0),
      depth: frame.depth + 1,
      bytes: frame.bytes,
      ancestors,
    })
  }
  self.close()
  None
}

///|
#warnings("-fragile_catch_all")
pub fn NetworkCursor::next(
  self : NetworkCursor,
) -> NetworkRecord? raise MmdbError {
  if self.failure is Some(error) {
    raise error
  }
  match self.reader {
    None => None
    Some(reader) =>
      self.advance(reader) catch {
        error => {
          self.failure = Some(error)
          self.close()
          raise error
        }
      }
  }
}
