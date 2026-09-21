///|
/// A machine-readable code, byte offset (-1 for non-file errors), and reason.
pub suberror MmdbError {
  MmdbError(String, Int, String)
} derive(@debug.Debug)

///|
/// Values retain their MMDB type. UInt128 is an exact decimal string.
pub(all) enum Value {
  Text(String)
  Blob(Bytes)
  Boolean(Bool)
  Unsigned16(UInt)
  Unsigned32(UInt)
  Signed32(Int)
  Unsigned64(UInt64)
  Unsigned128(String)
  Real32(Float32Value)
  Real64(Float64Value)
  List(Array[Value])
  Object(Array[(String, Value)])
} derive(Eq, @debug.Debug)

///|
/// Keep encoded bits authoritative; converting a signaling NaN can quiet it.
pub(all) struct Float32Value {
  bits : UInt
} derive(Eq, @debug.Debug)

///|
pub fn Float32Value::number(self : Float32Value) -> Float {
  Float::reinterpret_from_uint(self.bits)
}

///|
pub(all) struct Float64Value {
  bits : UInt64
} derive(Eq, @debug.Debug)

///|
pub fn Float64Value::number(self : Float64Value) -> Double {
  self.bits.reinterpret_as_double()
}

///|
/// Limits apply independently to each open or lookup operation.
pub(all) struct Limits {
  max_depth : Int
  max_values : Int
  max_payload_bytes : Int
  max_file_bytes : Int
} derive(Eq, @debug.Debug)

///|
pub fn Limits::default() -> Limits {
  {
    max_depth: 128,
    max_values: 65536,
    max_payload_bytes: 2097152,
    max_file_bytes: 268435456,
  }
}

///|
pub(all) struct Metadata {
  node_count : UInt
  record_size : Int
  ip_version : Int
  database_type : String
  format_major : Int
  format_minor : Int
  build_epoch : UInt64
  raw : Value
} derive(Eq, @debug.Debug)

///|
/// Opaque, reusable reader; opening validates metadata and section boundaries.
pub struct Reader {
  priv data : Bytes
  priv meta : Metadata
  priv tree_end : Int
  priv data_end : Int
  priv limits : Limits
}

///|
/// A missing record is distinct from an error. Prefix is in the input family.
pub(all) struct Lookup {
  value : Value?
  prefix_length : Int
} derive(Eq, @debug.Debug)

///|
pub fn version() -> String {
  "0.6.0"
}

///|
pub fn Value::get(self : Value, key : String) -> Value? {
  if self is Object(items) {
    for item in items {
      if item.0 == key {
        return Some(item.1)
      }
    }
  }
  None
}

///|
pub fn Value::text(self : Value) -> String? {
  match self {
    Text(s) => Some(s)
    _ => None
  }
}

///|
pub fn Reader::metadata(self : Reader) -> Metadata {
  self.meta
}

///|
pub fn MmdbError::code(self : MmdbError) -> String {
  let MmdbError(code, _, _) = self
  code
}

///|
pub fn MmdbError::offset(self : MmdbError) -> Int {
  let MmdbError(_, offset, _) = self
  offset
}

///|
pub fn MmdbError::message(self : MmdbError) -> String {
  let MmdbError(_, _, message) = self
  message
}
