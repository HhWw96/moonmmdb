///|
/// Independent consumer: only public MoonMMDB APIs; counters retain no log rows.
struct Counts {
  mut found : UInt64
  mut not_found : UInt64
  mut errors : UInt64
  mut missing : UInt64
}

///|
fn Counts::new() -> Counts {
  { found: 0, not_found: 0, errors: 0, missing: 0, }
}

///|
pub struct Analytics {
  priv enricher : @mmdb.Enricher?
  priv mut fatal : String?
  priv mut total : UInt64
  priv mut valid : UInt64
  priv mut invalid : UInt64
  priv mut exit_code : Int
  priv groups : Array[Map[String, UInt64]]
  priv counts : Array[Counts]
}

///|
#export_name("create_analytics")
pub fn create_analytics(geo : Bytes, asn : Bytes) -> Analytics {
  let mut fatal = None
  let enricher = Some(
    @mmdb.Enricher::new([
      {
        name: "geo",
        reader: @mmdb.open_bytes(geo),
        fields: @mmdb.prepare_fields(["/country/iso_code"]),
      },
      {
        name: "asn",
        reader: @mmdb.open_bytes(asn),
        fields: @mmdb.prepare_fields(["/autonomous_system_number"]),
      },
    ]),
  ) catch {
    e => {
      fatal = Some(e.to_json().stringify())
      None
    }
  }
  {
    enricher,
    fatal,
    total: 0,
    valid: 0,
    invalid: 0,
    exit_code: 0,
    groups: [Map([]), Map([])],
    counts: [Counts::new(), Counts::new()],
  }
}

///|
#export_name("analytics_status")
pub fn Analytics::analytics_status(self : Analytics) -> String {
  self.fatal.unwrap_or("{\"status\":\"valid\"}")
}

///|
fn Analytics::accept(self : Analytics, result : @mmdb.Enrichment) -> Unit {
  self.valid += 1
  self.exit_code = self.exit_code.max(result.status_code())
  for i in 0..<result.sources.length() {
    let count = self.counts[i]
    match result.sources[i].1 {
      Failed(_) => count.errors += 1
      Selected(p) => {
        if !p.record_found {
          count.not_found += 1
        } else {
          count.found += 1
        }
        let key = match p.fields[0].1 {
          Some(Text(value)) => if i == 0 { Some(value) } else { None }
          Some(Unsigned16(value)) | Some(Unsigned32(value)) =>
            if i == 1 {
              Some(value.to_string())
            } else {
              None
            }
          Some(Unsigned64(value)) =>
            if i == 1 {
              Some(value.to_string())
            } else {
              None
            }
          _ => None
        }
        match key {
          Some(key) => {
            let groups = self.groups[i]
            if !groups.contains(key) && groups.length() >= 10000 {
              self.fatal = Some(
                "{\"status\":\"error\",\"code\":\"group-limit\",\"message\":\"More than 10000 distinct groups\"}",
              )
              self.exit_code = 2
            } else {
              groups[key] = groups.get(key).unwrap_or(0) + 1
            }
          }
          None =>
            match p.fields[0].1 {
              None => count.missing += 1
              Some(_) => {
                count.errors += 1
                self.exit_code = 2
              }
            }
        }
      }
    }
  }
}

///|
#export_name("analytics_push")
pub fn Analytics::analytics_push(self : Analytics, ip : String) -> Unit {
  if self.fatal is Some(_) {
    return
  }
  self.total += 1
  match self.enricher {
    Some(enricher) =>
      self.accept(enricher.lookup(ip)) catch {
        _ => {
          self.invalid += 1
          self.exit_code = 2
        }
      }
    None => ()
  }
}

///|
#export_name("analytics_invalid")
pub fn Analytics::analytics_invalid(self : Analytics) -> Unit {
  if self.fatal is Some(_) {
    return
  }
  self.total += 1
  self.invalid += 1
  self.exit_code = 2
}

///|
fn top(groups : Map[String, UInt64]) -> Json {
  let rows = groups.iter().to_array()
  rows.sort_by((a, b) => {
    if a.1 > b.1 {
      -1
    } else if a.1 < b.1 {
      1
    } else {
      a.0.compare(b.0)
    }
  })
  let output : Array[Json] = []
  for i in 0..<rows.length().min(10) {
    output.push({
      "key": rows[i].0.to_json(),
      "count": rows[i].1.to_string().to_json(),
    })
  }
  output.to_json()
}

///|
#export_name("analytics_result")
pub fn Analytics::analytics_result(self : Analytics) -> String {
  if self.fatal is Some(error) {
    return error
  }
  let sources : Map[String, Json] = Map([])
  for i in 0..<2 {
    let c = self.counts[i]
    sources[if i == 0 { "geo" } else { "asn" }] = {
      "found": c.found.to_string().to_json(),
      "not_found": c.not_found.to_string().to_json(),
      "errors": c.errors.to_string().to_json(),
      "missing_fields": c.missing.to_string().to_json(),
    }
  }
  let output : Json = {
    "status": "summary",
    "exit_code": self.exit_code.to_json(),
    "requests": self.total.to_string().to_json(),
    "valid_ips": self.valid.to_string().to_json(),
    "invalid_inputs": self.invalid.to_string().to_json(),
    "country_top10": top(self.groups[0]),
    "asn_top10": top(self.groups[1]),
    "sources": sources.to_json(),
  }
  output.stringify()
}
