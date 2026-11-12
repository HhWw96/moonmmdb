///|
/// A separate MoonBit module consuming only the public reader API.
pub fn summarize(reader : @mmdb.Reader, ips : Array[String]) -> Json {
  let counts : Map[String, Int32] = Map([])
  let mut found = 0
  let mut not_found = 0
  let mut errors = 0
  let mut without_asn = 0
  let selector = @mmdb.prepare_fields(["/autonomous_system_number"]) catch {
    e => return e.to_json()
  }
  for ip in ips {
    try {
      let result = reader.project_prepared(ip, selector)
      if !result.record_found {
        not_found = not_found + 1
      } else {
        found = found + 1
        match result.fields[0].1 {
          Some(Unsigned32(asn)) => {
            let key = asn.to_string()
            counts[key] = counts.get(key).unwrap_or(0) + 1
          }
          _ => without_asn = without_asn + 1
        }
      }
    } catch {
      _ => errors = errors + 1
    }
  }
  {
    "found": @json.to_json(found),
    "not_found": @json.to_json(not_found),
    "errors": @json.to_json(errors),
    "found_without_asn": @json.to_json(without_asn),
    "asn_counts": @json.to_json(counts),
  }
}

///|
fn main {
  try {
    let reader = @mmdb.open_bytes(asn_fixture())
    println(
      summarize(reader, [
        "1.0.0.1", "1.0.0.2", "1.128.0.1", "255.255.255.255", "invalid",
      ]).stringify(indent=2),
    )
  } catch {
    e => println(e.to_json().stringify())
  }
}
