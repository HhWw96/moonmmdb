///|
#export_name("analysis_start")
pub fn analysis_start(
  city : Handle,
  asn : Handle,
  top : Int,
  max_groups : Int,
  ip_path : String,
) -> @analytics_bridge.AnalysisHandle {
  match (city.reader, asn.reader) {
    (Some(city), Some(asn)) =>
      @analytics_bridge.analysis_from_readers(
        city, asn, top, max_groups, ip_path,
      )
    _ =>
      @analytics_bridge.analysis_rejected(
        match city.error {
          Some(e) => e
          None => asn.error.unwrap()
        },
      )
  }
}

///|
#export_name("analysis_error")
pub fn analysis_error(handle : @analytics_bridge.AnalysisHandle) -> String {
  @analytics_bridge.analysis_error(handle)
}

///|
#export_name("analysis_metadata")
pub fn analysis_metadata(handle : @analytics_bridge.AnalysisHandle) -> String {
  @analytics_bridge.analysis_metadata(handle)
}

///|
#export_name("analysis_line")
pub fn analysis_line(
  handle : @analytics_bridge.AnalysisHandle,
  line : String,
) -> String {
  @analytics_bridge.analysis_line(handle, line)
}

///|
#export_name("analysis_finish")
pub fn analysis_finish(handle : @analytics_bridge.AnalysisHandle) -> String {
  @analytics_bridge.analysis_finish(handle)
}

///|
#export_name("analysis_close")
pub fn analysis_close(handle : @analytics_bridge.AnalysisHandle) -> Unit {
  @analytics_bridge.analysis_close(handle)
}

///|
#export_name("analysis_line_detailed")
pub fn analysis_line_detailed(
  handle : @analytics_bridge.AnalysisHandle,
  line : String,
) -> String {
  @analytics_bridge.analysis_line_detailed(handle, line)
}

///|
#export_name("diagnostics_create")
pub fn diagnostics_create(limit : Int) -> @analytics_bridge.DiagnosticBuffer {
  @analytics_bridge.diagnostics_create(limit)
}

///|
#export_name("diagnostics_add")
pub fn diagnostics_add(
  buffer : @analytics_bridge.DiagnosticBuffer,
  outcome : String,
  line : Int,
  start : Int,
  end : Int,
) -> Unit {
  @analytics_bridge.diagnostics_add(buffer, outcome, line, start, end)
}

///|
#export_name("diagnostics_finish")
pub fn diagnostics_finish(
  buffer : @analytics_bridge.DiagnosticBuffer,
) -> String {
  @analytics_bridge.diagnostics_finish(buffer)
}

///|
#export_name("extract_input_ip")
pub fn extract_input_ip(text : String, path : String) -> String {
  @analytics_bridge.extract_input_ip(text, path)
}
