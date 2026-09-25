///|
pub fn analysis_rejected(error : String) -> AnalysisHandle {
  { analyzer: None, error, metadata: null, tokens: [], }
}

///|
#export_name("analysis_create")
pub fn analysis_create(
  city : Bytes,
  asn : Bytes,
  top : Int,
  max_groups : Int,
  ip_path : String,
) -> AnalysisHandle {
  try {
    let _ = @mmdb.prepare_fields([ip_path])
    analysis_from_readers(
      @mmdb.open_bytes(city),
      @mmdb.open_bytes(asn),
      top,
      max_groups,
      ip_path,
    )
  } catch {
    e => analysis_rejected(e.to_json().stringify())
  }
}
