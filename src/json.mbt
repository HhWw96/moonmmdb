///|
fn tagged(kind : String, value : Json) -> Json {
  { "type": kind.to_json(), "value": value }
}

///|
/// Lossless JSON: all integer values are decimal strings; floats include bits.
pub fn Value::to_tagged_json(self : Value) -> Json {
  match self {
    Text(s) => tagged("string", s.to_json())
    Blob(bytes) => {
      let out = StringBuilder()
      for byte in bytes {
        let s = byte.to_int().to_string(radix=16)
        if s.length() == 1 {
          out.write_string("0")
        }
        out.write_string(s)
      }
      tagged("bytes", out.to_string().to_json())
    }
    Boolean(b) => tagged("boolean", b.to_json())
    Unsigned16(n) => tagged("uint16", n.to_string().to_json())
    Unsigned32(n) => tagged("uint32", n.to_string().to_json())
    Signed32(n) => tagged("int32", n.to_string().to_json())
    Unsigned64(n) => tagged("uint64", n.to_string().to_json())
    Unsigned128(s) => tagged("uint128", s.to_json())
    Real32(n) =>
      {
        "type": "float32",
        "value": n.to_string().to_json(),
        "bits": n.reinterpret_as_uint().to_string(radix=16).to_json(),
      }
    Real64(n) =>
      {
        "type": "float64",
        "value": n.to_string().to_json(),
        "bits": n.reinterpret_as_uint64().to_string(radix=16).to_json(),
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
    "status": (if self.value is Some(_) { "found" } else { "not_found" }).to_json(),
    "prefix_length": self.prefix_length.to_json(),
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
    "code": self.code().to_json(),
    "offset": self.offset().to_json(),
    "message": self.message().to_json(),
  }
}
