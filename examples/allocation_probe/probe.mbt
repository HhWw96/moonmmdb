///|
#export_name("probe_open")
pub fn probe_open(city : Bytes, country : Bytes) -> @mmdb.Enricher {
  @mmdb.Enricher::new([
    {
      name: "geo",
      reader: @mmdb.open_bytes(city),
      fields: @mmdb.prepare_fields(["/country/iso_code", "/city/names/en"]),
    },
    {
      name: "country",
      reader: @mmdb.open_bytes(country),
      fields: @mmdb.prepare_fields(["/country/iso_code"]),
    },
  ]) catch {
    _ => abort("Pinned diagnostic database failed to open")
  }
}

///|
#export_name("probe_query")
pub fn probe_query(handle : @mmdb.Enricher, ip : String) -> @mmdb.Enrichment {
  handle.lookup(ip) catch {
    _ => abort("Diagnostic uses valid IPs")
  }
}

///|
#export_name("probe_serialize")
pub fn probe_serialize(value : @mmdb.Enrichment) -> String {
  value.to_json().stringify()
}
