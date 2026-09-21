///|
fn[T : ToJson] optional(value : T?) -> Json {
  match value {
    None => Json::null()
    Some(v) => v.to_json()
  }
}

///|
fn country_label(country : @geo.Country?, locale : String) -> Json {
  match country {
    None => Json::null()
    Some(c) =>
      {
        "code": optional(c.iso_code),
        "name": optional(c.names.get(locale)),
        "geoname_id": optional(c.geoname_id.map(n => n.to_string())),
      }
  }
}

///|
/// One Reader per batch. Host supplies bytes, addresses and locale only.
#export_name("summarize")
pub fn summarize(
  bytes : Bytes,
  ips : Array[String],
  kind : String,
  locale : String,
) -> String {
  let results : Array[Json] = []
  try {
    let reader = @mmdb.open_bytes(bytes)
    for ip in ips {
      try {
        let row : Json = if kind == "asn" {
          let result = @geo.lookup_asn(reader, ip)
          match result.record {
            None =>
              { "status": "not_found", "prefix_length": result.prefix_length }
            Some(record) =>
              {
                "status": "found",
                "prefix_length": result.prefix_length,
                "number": optional(
                  record.autonomous_system_number.map(n => n.to_string()),
                ),
                "organization": optional(record.autonomous_system_organization),
              }
          }
        } else if kind == "city" {
          let result = @geo.lookup_city(reader, ip)
          match result.record {
            None =>
              { "status": "not_found", "prefix_length": result.prefix_length }
            Some(record) =>
              {
                "status": "found",
                "prefix_length": result.prefix_length,
                "country": country_label(record.country, locale),
                "registered_country": country_label(
                  record.registered_country,
                  locale,
                ),
                "city_name": optional(
                  record.city.bind(c => c.names.get(locale)),
                ),
                "postal_code": optional(record.postal_code),
                "latitude": optional(record.location.bind(l => l.latitude)),
                "longitude": optional(record.location.bind(l => l.longitude)),
                "time_zone": optional(record.location.bind(l => l.time_zone)),
                "subdivisions": record.subdivisions.map(s => {
                  "code": optional(s.iso_code),
                  "name": optional(s.names.get(locale)),
                  "geoname_id": optional(s.geoname_id.map(n => n.to_string())),
                }),
              }
          }
        } else {
          { "status": "error", "code": "invalid-kind" }
        }
        results.push(row)
      } catch {
        e =>
          results.push({
            "status": "error",
            "code": e.code(),
            "path": optional(e.path()),
          })
      }
    }
  } catch {
    e => return e.to_json().stringify()
  }
  Json::array(results).stringify()
}
