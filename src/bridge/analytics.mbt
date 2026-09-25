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
