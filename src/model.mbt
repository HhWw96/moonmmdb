///|
/// A machine-readable code, byte offset (-1 for non-file errors), and reason.
#derive(@debug.Debug)
pub suberror MmdbError {
  MmdbError(String, Int32, String)
}

///|
/// Values retain their MMDB type. UInt128 is an exact decimal string.
#derive(Eq, @debug.Debug)
pub(all) enum Value {
  Text(String)
  Blob(Bytes)
  Boolean(Bool)
  Unsigned16(UInt32)
  Unsigned32(UInt32)
  Signed32(Int32)
  Unsigned64(UInt64)
  Unsigned128(String)
  Real32(Float32Value)
  Real64(Float64Value)
  List(Array[Value])
  Object(Array[(String, Value)])
}

///|
/// Keep encoded bits authoritative; converting a signaling NaN can quiet it.
#derive(Eq, @debug.Debug)
pub(all) struct Float32Value {
  bits : UInt32
}

///|
pub fn Float32Value::number(self : Float32Value) -> Float {
  Float::reinterpret_from_uint(self.bits)
}

///|
#derive(Eq, @debug.Debug)
pub(all) struct Float64Value {
  bits : UInt64
}

///|
pub fn Float64Value::number(self : Float64Value) -> Double {
  self.bits.reinterpret_as_double()
}

///|
/// Limits apply independently to each open or lookup operation.
#derive(Eq, @debug.Debug)
pub(all) struct Limits {
  max_depth : Int32
  max_values : Int32
  max_payload_bytes : Int32
  max_file_bytes : Int32
}

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
#derive(Eq, @debug.Debug)
pub(all) struct Metadata {
  node_count : UInt32
  record_size : Int32
  ip_version : Int32
  database_type : String
  format_major : Int32
  format_minor : Int32
  build_epoch : UInt64
  raw : Value
}

///|
/// Opaque, reusable reader; opening validates metadata and section boundaries.
pub struct Reader {
  priv data : Bytes
  priv meta : Metadata
  priv tree_end : Int32
  priv data_end : Int32
  priv limits : Limits
}

///|
/// A missing record is distinct from an error. Prefix is in the input family.
#derive(Eq, @debug.Debug)
pub(all) struct Lookup {
  value : Value?
  prefix_length : Int32
}

///|
pub fn version() -> String {
  "0.9.5"
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
pub fn MmdbError::offset(self : MmdbError) -> Int32 {
  let MmdbError(_, offset, _) = self
  offset
}

///|
pub fn MmdbError::message(self : MmdbError) -> String {
  let MmdbError(_, _, message) = self
  message
}

///|
pub extend MmdbError with @debug.Debug::{to_repr}

///|
pub extend Value with Eq::{not_equal, equal}

///|
pub extend Value with @debug.Debug::{to_repr}

///|
pub extend Float32Value with Eq::{not_equal, equal}

///|
pub extend Float32Value with @debug.Debug::{to_repr}

///|
pub extend Float64Value with Eq::{not_equal, equal}

///|
pub extend Float64Value with @debug.Debug::{to_repr}

///|
pub extend Limits with Eq::{not_equal, equal}

///|
pub extend Limits with @debug.Debug::{to_repr}

///|
pub extend Metadata with Eq::{not_equal, equal}

///|
pub extend Metadata with @debug.Debug::{to_repr}

///|
pub extend Lookup with Eq::{not_equal, equal}

///|
pub extend Lookup with @debug.Debug::{to_repr}
