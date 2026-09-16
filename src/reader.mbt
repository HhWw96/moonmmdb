///|
fn required_u16(raw : Value, key : String, offset : Int) -> Int raise MmdbError {
  match raw.get(key) {
    Some(Unsigned16(value)) => value.reinterpret_as_int()
    _ =>
      raise MmdbError(
        "invalid-metadata",
        offset,
        "Expected uint16 metadata field: " + key,
      )
  }
}

///|
/// All untrusted size products are widened before indexing a byte buffer.
pub fn open_bytes(
  data : Bytes,
  limits? : Limits = Limits::default(),
) -> Reader raise MmdbError {
  if limits.max_depth < 1 ||
    limits.max_depth > 256 ||
    limits.max_values < 1 ||
    limits.max_values > 1000000 ||
    limits.max_payload_bytes < 1 ||
    limits.max_payload_bytes > 67108864 ||
    limits.max_file_bytes < 1 ||
    limits.max_file_bytes > 536870912 {
    raise MmdbError(
      "invalid-limits", -1, "Limits exceed the supported reader profile",
    )
  }
  if data.length() > limits.max_file_bytes {
    raise MmdbError("file-limit", -1, "Database exceeds file byte limit")
  }
  // A JS host may reuse its Uint8Array after opening. Keep a stable snapshot.
  let data = Bytes::makei(data.length(), i => data[i])
  let marker = b"\xab\xcd\xefMaxMind.com"
  let lower = (data.length() - 131072).max(0)
  let mut found = -1
  for i = data.length() - marker.length(); i >= lower; i = i - 1 {
    let mut matches = true
    for j in 0..<marker.length() {
      if data[i + j] != marker[j] {
        matches = false
        break
      }
    }
    if matches {
      found = i
      break
    }
  }
  if found < 0 {
    raise MmdbError(
      "missing-metadata", -1, "Metadata marker absent from final 128 KiB",
    )
  }
  let meta_start = found + marker.length()
  let ctx = decoder(data, meta_start, data.length(), limits)
  let (raw, _) = decode(ctx, meta_start, 0)
  let node_count = match raw.get("node_count") {
    Some(Unsigned32(n)) => n
    _ =>
      raise MmdbError(
        "invalid-metadata", meta_start, "Expected uint32 node_count",
      )
  }
  let record_size = required_u16(raw, "record_size", meta_start)
  if record_size != 24 && record_size != 28 && record_size != 32 {
    raise MmdbError(
      "unsupported-record-size", meta_start, "Only 24, 28 and 32 bit nodes are supported",
    )
  }
  let ip_version = required_u16(raw, "ip_version", meta_start)
  if ip_version != 4 && ip_version != 6 {
    raise MmdbError("invalid-metadata", meta_start, "ip_version must be 4 or 6")
  }
  let format_major = required_u16(
    raw, "binary_format_major_version", meta_start,
  )
  let format_minor = required_u16(
    raw, "binary_format_minor_version", meta_start,
  )
  if format_major != 2 {
    raise MmdbError(
      "unsupported-version", meta_start, "Expected MMDB format major 2",
    )
  }
  let database_type = match raw.get("database_type") {
    Some(Text(s)) => s
    _ =>
      raise MmdbError(
        "invalid-metadata", meta_start, "Expected string database_type",
      )
  }
  let build_epoch = match raw.get("build_epoch") {
    Some(Unsigned64(n)) => n
    _ =>
      raise MmdbError(
        "invalid-metadata", meta_start, "Expected uint64 build_epoch",
      )
  }
  match raw.get("languages") {
    None => ()
    Some(List(items)) =>
      for item in items {
        if !(item is Text(_)) {
          raise MmdbError(
            "invalid-metadata", meta_start, "languages must contain strings",
          )
        }
      }
    _ =>
      raise MmdbError(
        "invalid-metadata", meta_start, "languages must be an array",
      )
  }
  match raw.get("description") {
    None => ()
    Some(Object(items)) =>
      for item in items {
        if !(item.1 is Text(_)) {
          raise MmdbError(
            "invalid-metadata", meta_start, "description values must be strings",
          )
        }
      }
    _ =>
      raise MmdbError(
        "invalid-metadata", meta_start, "description must be a map",
      )
  }
  let tree_size = node_count.to_uint64() * (record_size / 4).to_uint64()
  if tree_size + 16 > found.to_uint64() {
    raise MmdbError(
      "invalid-layout", found, "Tree and separator overlap metadata",
    )
  }
  let tree_end = tree_size.to_int()
  for i in tree_end..<(tree_end + 16) {
    if data[i] != 0 {
      raise MmdbError(
        "invalid-separator", i, "Expected sixteen zero separator bytes",
      )
    }
  }
  let meta = {
    node_count,
    record_size,
    ip_version,
    database_type,
    format_major,
    format_minor,
    build_epoch,
    raw,
  }
  { data, meta, tree_end, data_end: found, limits, }
}

///|
fn Reader::branch(self : Reader, node : UInt, bit : Int) -> UInt {
  let size = self.meta.record_size
  let at = node.reinterpret_as_int() * (size / 4)
  let mut value : UInt = 0
  if size == 28 {
    let nibble = self.data[at + 3].to_uint()
    value = if bit == 0 { nibble >> 4 } else { nibble & 15 }
    let start = if bit == 0 { at } else { at + 4 }
    for i in start..<(start + 3) {
      value = (value << 8) | self.data[i].to_uint()
    }
  } else {
    let width = size / 8
    let start = at + bit * width
    for i in start..<(start + width) {
      value = (value << 8) | self.data[i].to_uint()
    }
  }
  value
}

///|
/// Mapped/6to4 aliases follow database edges; no implicit Teredo rewriting.
pub fn Reader::lookup(self : Reader, ip : String) -> Lookup raise MmdbError {
  let addr = parse_ip(ip)
  if addr.version == 6 && self.meta.ip_version == 4 {
    raise MmdbError(
      "ip-version-mismatch", -1, "IPv6 lookup against IPv4 database",
    )
  }
  let bits = if self.meta.ip_version == 4 { 32 } else { 128 }
  let padding = if addr.version == 4 && bits == 128 { 96 } else { 0 }
  let mut node : UInt = 0
  let mut depth = 0
  while node < self.meta.node_count && depth < bits {
    let bit = if depth < padding {
      0
    } else {
      let index = depth - padding
      (addr.bytes[index / 8] >> (7 - index % 8)) & 1
    }
    node = self.branch(node, bit)
    depth = depth + 1
  }
  let prefix_length = (depth - padding).max(0)
  if node == self.meta.node_count {
    return { value: None, prefix_length, }
  }
  if node < self.meta.node_count {
    raise MmdbError(
      "invalid-tree", -1, "Search has no terminal after all address bits",
    )
  }
  let relative = node.to_uint64() - self.meta.node_count.to_uint64()
  let offset = self.tree_end.to_uint64() + relative
  if relative < 16 || offset >= self.data_end.to_uint64() {
    raise MmdbError(
      "invalid-tree-pointer", -1, "Search record points outside data",
    )
  }
  let ctx = decoder(self.data, self.tree_end + 16, self.data_end, self.limits)
  let (value, _) = decode(ctx, offset.to_int(), 0)
  { value: Some(value), prefix_length, }
}
