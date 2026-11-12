///|
fn tagged(kind : String, value : Json) -> Json {
  { "type": @json.to_json(kind), "value": value }
}

///|
/// Lossless JSON: all integer values are decimal strings; floats include bits.
pub fn Value::to_tagged_json(self : Value) -> Json {
  match self {
    Text(s) => tagged("string", @json.to_json(s))
    Blob(bytes) => {
      let out = StringBuilder()
      for byte in bytes {
        let s = byte.to_int().to_string(radix=16)
        if s.length() == 1 {
          out.write_string("0")
        }
        out.write_string(s)
      }
      tagged("bytes", @json.to_json(out.to_string()))
    }
    Boolean(b) => tagged("boolean", @json.to_json(b))
    Unsigned16(n) => tagged("uint16", @json.to_json(n.to_string()))
    Unsigned32(n) => tagged("uint32", @json.to_json(n.to_string()))
    Signed32(n) => tagged("int32", @json.to_json(n.to_string()))
    Unsigned64(n) => tagged("uint64", @json.to_json(n.to_string()))
    Unsigned128(s) => tagged("uint128", @json.to_json(s))
    Real32(n) =>
      {
        "type": "float32",
        "value": @json.to_json(n.number().to_string()),
        "bits": @json.to_json(n.bits.to_string(radix=16)),
      }
    Real64(n) =>
      {
        "type": "float64",
        "value": @json.to_json(n.number().to_string()),
        "bits": @json.to_json(n.bits.to_string(radix=16)),
      }
    List(items) =>
      tagged("array", Json::array(items.map(item => item.to_tagged_json())))
    Object(items) => {
      let values : Map[String, Json] = Map([])
      for item in items {
        values[item.0] = item.1.to_tagged_json()
      }
      tagged("map", Json::object(values))
    }
  }
}

///|
pub fn Lookup::to_json(self : Lookup) -> Json {
  {
    "status": @json.to_json(
      if self.value is Some(_) {
        "found"
      } else {
        "not_found"
      },
    ),
    "prefix_length": @json.to_json(self.prefix_length),
    "record": match self.value {
      Some(v) => v.to_tagged_json()
      None => Json::null()
    },
  }
}

///|
pub fn MmdbError::to_json(self : MmdbError) -> Json {
  {
    "status": "error",
    "code": @json.to_json(self.code()),
    "offset": @json.to_json(self.offset()),
    "message": @json.to_json(self.message()),
  }
}
