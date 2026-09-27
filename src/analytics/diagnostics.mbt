///|
/// Per-row classification. Contains no input IP, payload or database field values.
pub struct AnalysisRowOutcome {
  priv details : Json
}

///|
#warnings("-deprecated")
pub fn AnalysisRowOutcome::to_json(self : AnalysisRowOutcome) -> Json {
  // A new JSON tree prevents callers from mutating a retained outcome.
  @json.parse(self.details.stringify()) catch {
    _ => null
  }
}

///|
pub fn Analyzer::push_detailed(
  self : Analyzer,
  ip : String,
) -> AnalysisRowOutcome raise AnalyticsError {
  self.ready()
  let result = match self.enricher {
    Some(enricher) => Some(enricher.lookup(ip)) catch { _ => None }
    None => None
  }
  match result {
    None => {
      self.invalid_input()
      { details: { "input": "invalid-ip", "issues": [] }, }
    }
    Some(result) => {
      self.accept(result)
      let issues : Array[Json] = []
      for i in 0..<2 {
        let source = result.sources[i]
        let (category, _) = classify(source.1, i)
        if category != 0 {
          let fields : Map[String, Json] = Map([
            ("dimension", source.0.to_json()),
            (
              "category",
              match category {
                1 => "not_found"
                2 => "missing_field"
                3 => "type_error"
                _ => "query_error"
              },
            ),
          ])
          if source.1 is Failed(e) {
            fields["code"] = e.code().to_json()
            fields["database_offset"] = e.offset().to_json()
          }
          issues.push(fields.to_json())
        }
      }
      { details: { "input": "valid", "issues": issues.to_json() }, }
    }
  }
}
