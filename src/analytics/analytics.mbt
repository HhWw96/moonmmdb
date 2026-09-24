///|
pub suberror AnalyticsError {
  AnalyticsError(String, String)
} derive(@debug.Debug)

///|
pub fn AnalyticsError::code(self : AnalyticsError) -> String {
  let AnalyticsError(code, _) = self
  code
}

///|
pub fn AnalyticsError::to_json(self : AnalyticsError) -> Json {
  let AnalyticsError(code, message) = self
  { "status": "error", "code": code.to_json(), "message": message.to_json() }
}

///|
pub(all) struct AnalyticsLimits {
  top : Int
  max_groups : Int
} derive(Eq, @debug.Debug)

///|
pub fn AnalyticsLimits::default() -> AnalyticsLimits {
  { top: 10, max_groups: 10000, }
}

///|
pub(all) struct GroupCount {
  key : String
  count : UInt64
} derive(Eq, @debug.Debug)

///|
pub(all) struct DimensionReport {
  counted : UInt64
  not_found : UInt64
  missing_field : UInt64
  type_error : UInt64
  query_error : UInt64
  group_count : Int
  other_requests : UInt64
  top : Array[GroupCount]
} derive(Eq, @debug.Debug)

///|
pub(all) struct AnalyticsReport {
  requests : UInt64
  valid_ips : UInt64
  invalid_inputs : UInt64
  exit_code : Int
  country : DimensionReport
  asn : DimensionReport
} derive(Eq, @debug.Debug)

///|
pub fn DimensionReport::to_json(self : DimensionReport) -> Json {
  {
    "counted": self.counted.to_string().to_json(),
    "not_found": self.not_found.to_string().to_json(),
    "missing_field": self.missing_field.to_string().to_json(),
    "type_error": self.type_error.to_string().to_json(),
    "query_error": self.query_error.to_string().to_json(),
    "group_count": self.group_count.to_string().to_json(),
    "other_requests": self.other_requests.to_string().to_json(),
    "top": self.top
    .map(fn(row) {
      { "key": row.key.to_json(), "count": row.count.to_string().to_json() }
    })
    .to_json(),
  }
}

///|
pub fn AnalyticsReport::to_json(self : AnalyticsReport) -> Json {
  {
    "status": "complete",
    "requests": self.requests.to_string().to_json(),
    "valid_ips": self.valid_ips.to_string().to_json(),
    "invalid_inputs": self.invalid_inputs.to_string().to_json(),
    "exit_code": self.exit_code.to_json(),
    "country": self.country.to_json(),
    "asn": self.asn.to_json(),
  }
}

///|
pub struct Analyzer {
  priv mut enricher : @mmdb.Enricher?
  priv limits : AnalyticsLimits
  priv mut fatal : AnalyticsError?
  priv mut finished : Bool
  priv mut closed : Bool
  priv mut total : UInt64
  priv mut valid : UInt64
  priv mut invalid : UInt64
  priv mut exit_code : Int
  priv groups : Array[Map[String, UInt64]]
  // counted, not found, missing field, type error, query error
  priv counts : Array[Array[UInt64]]
}

///|
pub fn Analyzer::new(
  city : @mmdb.Reader,
  asn : @mmdb.Reader,
  limits? : AnalyticsLimits = AnalyticsLimits::default(),
) -> Analyzer raise AnalyticsError {
  if limits.top < 1 ||
    limits.top > 100 ||
    limits.max_groups < 1 ||
    limits.max_groups > 10000 {
    raise AnalyticsError(
      "invalid-limits", "top must be 1..100 and max_groups 1..10000",
    )
  }
  let enricher = @mmdb.Enricher::new([
    {
      name: "country",
      reader: city,
      fields: @mmdb.prepare_fields(["/country/iso_code"]),
    },
    {
      name: "asn",
      reader: asn,
      fields: @mmdb.prepare_fields(["/autonomous_system_number"]),
    },
  ]) catch {
    e => raise AnalyticsError(e.code(), e.message())
  }
  {
    enricher: Some(enricher),
    limits,
    fatal: None,
    finished: false,
    closed: false,
    total: 0,
    valid: 0,
    invalid: 0,
    exit_code: 0,
    groups: [Map([]), Map([])],
    counts: [[0, 0, 0, 0, 0], [0, 0, 0, 0, 0]],
  }
}

///|
fn Analyzer::ready(self : Analyzer) -> Unit raise AnalyticsError {
  if self.fatal is Some(error) {
    raise error
  }
  if self.closed || self.finished {
    raise AnalyticsError("analyzer-closed", "Analyzer no longer accepts input")
  }
}

///|
fn Analyzer::stop(
  self : Analyzer,
  code : String,
  message : String,
) -> Unit raise AnalyticsError {
  let error = AnalyticsError(code, message)
  self.fatal = Some(error)
  self.enricher = None
  raise error
}

///|
fn Analyzer::incrementable(
  self : Analyzer,
  value : UInt64,
) -> Unit raise AnalyticsError {
  if value == 18446744073709551615 {
    self.stop("counter-overflow", "Count exceeds UInt64")
  }
}

///|
fn classify(result : @mmdb.SourceResult, dimension : Int) -> (Int, String?) {
  match result {
    Failed(_) => (4, None)
    Selected(p) => {
      if !p.record_found {
        return (1, None)
      }
      match p.fields[0].1 {
        None => (2, None)
        Some(Text(s)) => if dimension == 0 { (0, Some(s)) } else { (3, None) }
        Some(Unsigned16(n)) | Some(Unsigned32(n)) =>
          if dimension == 1 {
            (0, Some(n.to_string()))
          } else {
            (3, None)
          }
        Some(Unsigned64(n)) =>
          if dimension == 1 {
            (0, Some(n.to_string()))
          } else {
            (3, None)
          }
        _ => (3, None)
      }
    }
  }
}

///|
fn Analyzer::accept(
  self : Analyzer,
  result : @mmdb.Enrichment,
) -> Unit raise AnalyticsError {
  self.ready()
  let rows = [
    classify(result.sources[0].1, 0),
    classify(result.sources[1].1, 1),
  ]
  self.incrementable(self.total)
  self.incrementable(self.valid)
  // Validate the whole row before changing either dimension.
  for i in 0..<2 {
    let (category, key) = rows[i]
    self.incrementable(self.counts[i][category])
    if key is Some(key) {
      if @utf8.encode(key[:]).length() > 256 {
        self.stop("key-limit", "Group key exceeds 256 UTF-8 bytes")
      }
      let groups = self.groups[i]
      if !groups.contains(key) && groups.length() >= self.limits.max_groups {
        self.stop("group-limit", "Distinct groups exceed max_groups")
      }
      self.incrementable(groups.get(key).unwrap_or(0))
    }
  }
  self.total += 1
  self.valid += 1
  for i in 0..<2 {
    let (category, key) = rows[i]
    self.counts[i][category] += 1
    if category == 1 {
      self.exit_code = self.exit_code.max(1)
    }
    if category >= 3 {
      self.exit_code = 2
    }
    if key is Some(key) {
      self.groups[i][key] = self.groups[i].get(key).unwrap_or(0) + 1
    }
  }
}

///|
/// Invalid IP syntax is counted as one invalid input, without querying a source.
pub fn Analyzer::push(
  self : Analyzer,
  ip : String,
) -> Unit raise AnalyticsError {
  self.ready()
  if self.enricher is Some(enricher) {
    let result = Some(enricher.lookup(ip)) catch { _ => None }
    match result {
      Some(result) => self.accept(result)
      None => self.invalid_input()
    }
  }
}

///|
pub fn Analyzer::invalid_input(self : Analyzer) -> Unit raise AnalyticsError {
  self.ready()
  self.incrementable(self.total)
  self.incrementable(self.invalid)
  self.total += 1
  self.invalid += 1
  self.exit_code = 2
}

///|
fn Analyzer::dimension(self : Analyzer, i : Int) -> DimensionReport {
  let rows = self.groups[i].iter().to_array()
  rows.sort_by(fn(a, b) {
    if a.1 > b.1 {
      -1
    } else if a.1 < b.1 {
      1
    } else {
      a.0.lexical_compare(b.0)
    }
  })
  let top : Array[GroupCount] = []
  let mut selected : UInt64 = 0
  for j in 0..<rows.length().min(self.limits.top) {
    top.push({ key: rows[j].0, count: rows[j].1, })
    selected += rows[j].1
  }
  let c = self.counts[i]
  {
    counted: c[0],
    not_found: c[1],
    missing_field: c[2],
    type_error: c[3],
    query_error: c[4],
    group_count: rows.length(),
    other_requests: c[0] - selected,
    top,
  }
}

///|
/// Seals input. Each call returns new report arrays, isolated from the analyzer.
pub fn Analyzer::finish(
  self : Analyzer,
) -> AnalyticsReport raise AnalyticsError {
  if self.fatal is Some(error) {
    raise error
  }
  if self.closed {
    raise AnalyticsError("analyzer-closed", "Analyzer is closed")
  }
  self.finished = true
  self.enricher = None
  {
    requests: self.total,
    valid_ips: self.valid,
    invalid_inputs: self.invalid,
    exit_code: self.exit_code,
    country: self.dimension(0),
    asn: self.dimension(1),
  }
}

///|
pub fn Analyzer::close(self : Analyzer) -> Unit {
  self.enricher = None
  self.closed = true
  for groups in self.groups {
    groups.clear()
  }
}
