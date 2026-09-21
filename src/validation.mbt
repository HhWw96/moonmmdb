///|
pub(all) struct ValidationLimits {
  max_work : Int
  max_state_bytes : Int
} derive(Eq, @debug.Debug)

///|
pub fn ValidationLimits::default() -> ValidationLimits {
  { max_work: 100000000, max_state_bytes: 67108864, }
}

///|
pub(all) struct ValidationReport {
  checked_nodes : Int
  reachable_nodes : Int
  unreachable_nodes : Int
  decoded_records : Int
  decoded_data : Bool
  work_used : Int
  peak_state_bytes : Int
} derive(Eq, @debug.Debug)

///|
pub fn ValidationReport::to_json(self : ValidationReport) -> Json {
  {
    "status": "valid",
    "scope": (if self.decoded_data {
      "all-tree-nodes-and-referenced-records"
    } else {
      "all-tree-nodes"
    }).to_json(),
    "checked_nodes": self.checked_nodes.to_json(),
    "reachable_nodes": self.reachable_nodes.to_json(),
    "unreachable_nodes": self.unreachable_nodes.to_json(),
    "decoded_records": self.decoded_records.to_json(),
    "work_used": self.work_used.to_json(),
    "peak_state_bytes": self.peak_state_bytes.to_json(),
  }
}

///|
/// A resource rejection is not proof that the database is corrupt.
pub fn MmdbError::validation_status(self : MmdbError) -> String {
  match self.code() {
    "work-limit"
    | "state-limit"
    | "depth-limit"
    | "value-limit"
    | "payload-limit"
    | "file-limit" => "incomplete"
    "invalid-limits" => "error"
    _ => "invalid"
  }
}

///|
pub fn MmdbError::to_validation_json(self : MmdbError) -> Json {
  {
    "status": self.validation_status().to_json(),
    "code": self.code().to_json(),
    "offset": self.offset().to_json(),
    "message": self.message().to_json(),
  }
}

///|
pub fn Reader::validate(
  self : Reader,
  decode_data? : Bool = false,
  limits? : ValidationLimits = ValidationLimits::default(),
) -> ValidationReport raise MmdbError {
  let work = operation_work(limits.max_work)
  if limits.max_state_bytes < 1 || limits.max_state_bytes > 268435456 {
    raise MmdbError("invalid-limits", -1, "State limit must be 1..268435456")
  }
  let count = self.meta.node_count.reinterpret_as_int()
  let data_start = self.tree_end + 16
  let bitmap_size = if decode_data {
    (self.data_end - data_start + 7) / 8
  } else {
    0
  }
  // FixedArray[Byte] has byte storage on all three backends. Include temporary
  // old+new stack buffers in the peak budget when growing the explicit stack.
  let base_size = count.to_int64() * 2 + bitmap_size.to_int64()
  let mut capacity = count.min(128)
  if base_size + capacity.to_int64() * 4 > limits.max_state_bytes.to_int64() {
    raise MmdbError(
      "state-limit", -1, "Validation state exceeds auxiliary buffer budget",
    )
  }
  let states : FixedArray[Byte] = FixedArray::make(count, b'\x00')
  let heights : FixedArray[Byte] = FixedArray::make(count, b'\x00')
  let seen : FixedArray[Byte] = FixedArray::make(bitmap_size, b'\x00')
  let mut stack : FixedArray[Int] = FixedArray::make(capacity, 0)
  let mut peak = base_size.to_int() + capacity * 4
  let mut checked = 0
  let mut reachable = 0
  let mut decoded = 0
  let bits = if self.meta.ip_version == 4 { 32 } else { 128 }
  for root in 0..<count {
    work.charge(1, root * (self.meta.record_size / 4))
    if states[root] != b'\x00' {
      continue
    }
    let mut length = 1
    stack[0] = root
    states[root] = b'\x01'
    while length > 0 {
      let node = stack[length - 1]
      let stage = states[node].to_int()
      let at = node * (self.meta.record_size / 4)
      if stage <= 2 {
        states[node] = (stage + 1).to_byte()
        work.charge(1, at)
        let child = self.branch(node.reinterpret_as_uint(), stage - 1)
        if child < self.meta.node_count {
          let target = child.reinterpret_as_int()
          let state = states[target].to_int()
          if state > 0 && state < 4 {
            raise MmdbError("tree-cycle", at, "Cycle in physical search tree")
          }
          if state == 0 {
            if length == capacity {
              let next_capacity = (capacity * 2).min(count)
              let new_peak = base_size +
                (capacity.to_int64() + next_capacity.to_int64()) * 4
              if new_peak > limits.max_state_bytes.to_int64() {
                raise MmdbError(
                  "state-limit", at, "Validation stack exceeds auxiliary buffer budget",
                )
              }
              let next_stack = FixedArray::make(next_capacity, 0)
              for i in 0..<length {
                next_stack[i] = stack[i]
              }
              stack = next_stack
              capacity = next_capacity
              peak = peak.max(new_peak.to_int())
            }
            stack[length] = target
            length = length + 1
            states[target] = b'\x01'
          }
        } else if child > self.meta.node_count {
          ignore(self.data_offset(child, at))
        }
      } else {
        work.charge(2, at)
        let mut height = 1
        for bit in 0..<2 {
          let child = self.branch(node.reinterpret_as_uint(), bit)
          if child < self.meta.node_count {
            height = height.max(
              1 + heights[child.reinterpret_as_int()].to_int(),
            )
          }
        }
        heights[node] = height.min(129).to_byte()
        states[node] = b'\x04'
        checked = checked + 1
        length = length - 1
      }
    }
    if root == 0 {
      reachable = checked
      if heights[0].to_int() > bits {
        raise MmdbError(
          "invalid-tree", 0, "A reachable search path exceeds the address width",
        )
      }
    }
  }
  // Finish structural validation before decoding any referenced record.
  if decode_data {
    for node in 0..<count {
      for bit in 0..<2 {
        let at = node * (self.meta.record_size / 4)
        work.charge(1, at)
        let child = self.branch(node.reinterpret_as_uint(), bit)
        if child > self.meta.node_count {
          let offset = self.data_offset(child, at)
          let relative = offset - data_start
          let index = relative / 8
          let mask = 1 << (relative % 8)
          if (seen[index].to_int() & mask) == 0 {
            let ctx = decoder(
              self.data,
              data_start,
              self.data_end,
              self.limits,
              work=Some(work),
            )
            ignore(decode(ctx, offset, 0))
            seen[index] = (seen[index].to_int() | mask).to_byte()
            decoded = decoded + 1
          }
        }
      }
    }
  }
  {
    checked_nodes: checked,
    reachable_nodes: reachable,
    unreachable_nodes: checked - reachable,
    decoded_records: decoded,
    decoded_data: decode_data,
    work_used: work.maximum - work.remaining,
    peak_state_bytes: peak,
  }
}
