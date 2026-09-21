///|
/// Schema failures preserve the field path; database failures preserve the core error.
pub suberror GeoError {
  SchemaMismatch(String, String)
  DatabaseError(@mmdb.MmdbError)
} derive(@debug.Debug)

///|
pub fn GeoError::code(self : GeoError) -> String {
  match self {
    SchemaMismatch(_, _) => "schema-mismatch"
    DatabaseError(e) => e.code()
  }
}

///|
pub fn GeoError::path(self : GeoError) -> String? {
  match self {
    SchemaMismatch(path, _) => Some(path)
    DatabaseError(_) => None
  }
}

///|
pub fn GeoError::message(self : GeoError) -> String {
  match self {
    SchemaMismatch(path, expected) => "Expected " + expected + " at " + path
    DatabaseError(e) => e.message()
  }
}

///|
/// Optional schema adapters. Missing fields remain None; wrong types raise.
pub(all) struct AsnRecord {
  autonomous_system_number : UInt?
  autonomous_system_organization : String?
} derive(Eq, @debug.Debug)

///|
pub(all) struct Country {
  iso_code : String?
  geoname_id : UInt?
  names : Map[String, String]
  is_in_european_union : Bool?
} derive(Eq, @debug.Debug)

///|
pub(all) struct Place {
  geoname_id : UInt?
  names : Map[String, String]
} derive(Eq, @debug.Debug)

///|
pub(all) struct Subdivision {
  iso_code : String?
  geoname_id : UInt?
  names : Map[String, String]
} derive(Eq, @debug.Debug)

///|
pub(all) struct Location {
  latitude : Double?
  longitude : Double?
  accuracy_radius : UInt?
  time_zone : String?
  metro_code : UInt?
} derive(Eq, @debug.Debug)

///|
/// Selected common City fields; unknown vendor-specific fields are ignored.
pub(all) struct CityRecord {
  continent_code : String?
  country : Country?
  registered_country : Country?
  city : Place?
  subdivisions : Array[Subdivision]
  postal_code : String?
  location : Location?
} derive(Eq, @debug.Debug)

///|
pub(all) struct AsnLookup {
  record : AsnRecord?
  prefix_length : Int
} derive(Eq, @debug.Debug)

///|
pub(all) struct CityLookup {
  record : CityRecord?
  prefix_length : Int
} derive(Eq, @debug.Debug)

///|
fn mismatch(path : String, expected : String) -> GeoError {
  SchemaMismatch(path, expected)
}

///|
fn object(value : @mmdb.Value, path : String) -> @mmdb.Value raise GeoError {
  match value {
    Object(_) => value
    _ => raise mismatch(path, "object")
  }
}

///|
fn child(
  value : @mmdb.Value,
  key : String,
  path : String,
) -> @mmdb.Value? raise GeoError {
  match value.get(key) {
    Some(v) => Some(object(v, path))
    None => None
  }
}

///|
fn text(
  value : @mmdb.Value,
  key : String,
  path : String,
) -> String? raise GeoError {
  match value.get(key) {
    None => None
    Some(Text(s)) => Some(s)
    _ => raise mismatch(path + "/" + key, "string")
  }
}

///|
fn uint(
  value : @mmdb.Value,
  key : String,
  path : String,
) -> UInt? raise GeoError {
  match value.get(key) {
    None => None
    Some(Unsigned16(n)) | Some(Unsigned32(n)) => Some(n)
    Some(Unsigned64(n)) => {
      if n > 4294967295UL {
        raise mismatch(path + "/" + key, "uint32 range")
      }
      Some(n.to_uint())
    }
    _ => raise mismatch(path + "/" + key, "unsigned integer")
  }
}

///|
fn boolean(
  value : @mmdb.Value,
  key : String,
  path : String,
) -> Bool? raise GeoError {
  match value.get(key) {
    None => None
    Some(Boolean(b)) => Some(b)
    _ => raise mismatch(path + "/" + key, "boolean")
  }
}

///|
fn coordinate(
  value : @mmdb.Value,
  key : String,
  bound : Double,
) -> Double? raise GeoError {
  let n = match value.get(key) {
    None => return None
    Some(Real32(n)) => n.number().to_double()
    Some(Real64(n)) => n.number()
    _ => raise mismatch("/location/" + key, "floating point coordinate")
  }
  if n != n || n < -bound || n > bound {
    raise mismatch("/location/" + key, "finite coordinate in range")
  }
  Some(n)
}

///|
fn names(
  value : @mmdb.Value,
  path : String,
) -> Map[String, String] raise GeoError {
  let result : Map[String, String] = Map([])
  match value.get("names") {
    None => ()
    Some(Object(items)) =>
      for item in items {
        match item.1 {
          Text(s) => result[item.0] = s
          _ => raise mismatch(path + "/names", "localized string values")
        }
      }
    _ => raise mismatch(path + "/names", "object")
  }
  result
}

///|
fn country(value : @mmdb.Value, key : String) -> Country? raise GeoError {
  let path = "/" + key
  match child(value, key, path) {
    None => None
    Some(v) =>
      Some({
        iso_code: text(v, "iso_code", path),
        geoname_id: uint(v, "geoname_id", path),
        names: names(v, path),
        is_in_european_union: boolean(v, "is_in_european_union", path),
      })
  }
}

///|
/// Convert a decoded map without coercion. This does not certify database_type.
pub fn AsnRecord::from_value(value : @mmdb.Value) -> AsnRecord raise GeoError {
  let value = object(value, "")
  {
    autonomous_system_number: uint(value, "autonomous_system_number", ""),
    autonomous_system_organization: text(
      value, "autonomous_system_organization", "",
    ),
  }
}

///|
/// Known fields are checked; missing fields and missing locales are not errors.
/// Caller-created Values are not subject to Reader resource budgets.
pub fn CityRecord::from_value(value : @mmdb.Value) -> CityRecord raise GeoError {
  let value = object(value, "")
  let subdivisions : Array[Subdivision] = []
  match value.get("subdivisions") {
    None => ()
    Some(List(items)) =>
      for i, item in items {
        let path = "/subdivisions/" + i.to_string()
        let item = object(item, path)
        subdivisions.push({
          iso_code: text(item, "iso_code", path),
          geoname_id: uint(item, "geoname_id", path),
          names: names(item, path),
        })
      }
    _ => raise mismatch("/subdivisions", "array")
  }
  {
    continent_code: match child(value, "continent", "/continent") {
      None => None
      Some(v) => text(v, "code", "/continent")
    },
    country: country(value, "country"),
    registered_country: country(value, "registered_country"),
    city: match child(value, "city", "/city") {
      None => None
      Some(v) =>
        Some({
          geoname_id: uint(v, "geoname_id", "/city"),
          names: names(v, "/city"),
        })
    },
    subdivisions,
    postal_code: match child(value, "postal", "/postal") {
      None => None
      Some(v) => text(v, "code", "/postal")
    },
    location: match child(value, "location", "/location") {
      None => None
      Some(v) =>
        Some({
          latitude: coordinate(v, "latitude", 90.0),
          longitude: coordinate(v, "longitude", 180.0),
          accuracy_radius: uint(v, "accuracy_radius", "/location"),
          time_zone: text(v, "time_zone", "/location"),
          metro_code: uint(v, "metro_code", "/location"),
        })
    },
  }
}

///|
/// Reuses the Reader; an IP miss is distinct from a record with missing fields.
pub fn lookup_asn(
  reader : @mmdb.Reader,
  ip : String,
) -> AsnLookup raise GeoError {
  let result = reader.lookup(ip) catch { e => raise DatabaseError(e) }
  {
    prefix_length: result.prefix_length,
    record: match result.value {
      None => None
      Some(v) => Some(AsnRecord::from_value(v))
    },
  }
}

///|
pub fn lookup_city(
  reader : @mmdb.Reader,
  ip : String,
) -> CityLookup raise GeoError {
  let result = reader.lookup(ip) catch { e => raise DatabaseError(e) }
  {
    prefix_length: result.prefix_length,
    record: match result.value {
      None => None
      Some(v) => Some(CityRecord::from_value(v))
    },
  }
}
