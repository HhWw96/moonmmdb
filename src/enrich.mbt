///|
/// A named database and its reusable field selection. Names are ASCII identifiers.
pub(all) struct EnrichmentSource {
  name : String
  reader : Reader
  fields : FieldSelector
}

///|
pub(all) enum SourceResult {
  Selected(Projection)
  Failed(MmdbError)
} derive(@debug.Debug)

///|
pub(all) struct Enrichment {
  sources : Array[(String, SourceResult)]
} derive(@debug.Debug)

///|
pub struct Enricher {
  priv sources : Array[EnrichmentSource]
}

///|
pub fn Enricher::new(
  sources : Array[EnrichmentSource],
) -> Enricher raise MmdbError {
  if sources.length() < 1 || sources.length() > 4 {
    raise MmdbError("source-limit", -1, "Expected one to four sources")
  }
  let seen : Map[String, Bool] = Map([])
  for source in sources {
    let name = source.name
    if name.length() < 1 || name.length() > 32 {
      raise MmdbError(
        "invalid-source", -1, "Source name must contain 1 to 32 ASCII characters",
      )
    }
    for i in 0..<name.length() {
      let ch = name[i]
      let letter = (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z')
      if !letter &&
        (i == 0 || !((ch >= '0' && ch <= '9') || ch == '_' || ch == '-')) {
        raise MmdbError(
          "invalid-source", -1, "Source name must start with a letter and contain letters, digits, _ or -",
        )
      }
    }
    if seen.contains(name) {
      raise MmdbError("duplicate-source", -1, "Duplicate source: " + name)
    }
    seen[name] = true
  }
  { sources: sources.copy(), }
}

///|
/// Invalid IP is a row error. Reader errors remain local to the named source.
pub fn Enricher::lookup(
  self : Enricher,
  ip : String,
) -> Enrichment raise MmdbError {
  ignore(parse_ip(ip))
  let sources = self.sources.map(source => {
    let result = Selected(source.reader.project_prepared(ip, source.fields)) catch {
      e => Failed(e)
    }
    (source.name, result)
  })
  { sources, }
}

///|
pub fn Enrichment::status_code(self : Enrichment) -> Int {
  let mut code = 0
  for item in self.sources {
    match item.1 {
      Failed(_) => code = 2
      Selected(p) => if !p.record_found { code = code.max(1) }
    }
  }
  code
}

///|
pub fn Enrichment::to_json(self : Enrichment) -> Json {
  let sources : Map[String, Json] = Map([])
  for item in self.sources {
    sources[item.0] = match item.1 {
      Selected(p) => p.to_json()
      Failed(e) => e.to_json()
    }
  }
  {
    "status": (match self.status_code() {
      2 => "error"
      1 => "not_found"
      _ => "found"
    }).to_json(),
    "sources": sources.to_json(),
  }
}
