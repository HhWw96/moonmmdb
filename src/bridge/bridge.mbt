///|
/// The host keeps an opaque handle; errors travel as JSON, never partial records.
pub struct Handle {
  priv reader : @mmdb.Reader?
  priv error : String?
}

///|
#export_name("open_database")
pub fn open_database(bytes : Bytes) -> Handle {
  { reader: Some(@mmdb.open_bytes(bytes)), error: None, } catch {
    e => { reader: None, error: Some(e.to_json().stringify()), }
  }
}

///|
#export_name("metadata")
pub fn metadata(handle : Handle) -> String {
  match handle.reader {
    Some(reader) => {
      let response : Json = {
        "status": "opened",
        "metadata": reader.metadata().raw.to_tagged_json(),
      }
      response.stringify()
    }
    None => handle.error.unwrap()
  }
}

///|
#export_name("lookup")
pub fn lookup(handle : Handle, ip : String) -> String {
  match handle.reader {
    Some(reader) =>
      reader.lookup(ip).to_json().stringify() catch {
        e => e.to_json().stringify()
      }
    None => handle.error.unwrap()
  }
}

///|
#export_name("project")
pub fn project(handle : Handle, ip : String, paths : Array[String]) -> String {
  match handle.reader {
    Some(reader) =>
      reader.project(ip, paths).to_json().stringify() catch {
        e => e.to_json().stringify()
      }
    None => handle.error.unwrap()
  }
}

///|
#export_name("validate_paths")
pub fn validate_paths(paths : Array[String]) -> String {
  try {
    @mmdb.validate_paths(paths)
    let result : Json = { "status": "valid" }
    result.stringify()
  } catch {
    e => e.to_json().stringify()
  }
}

///|
pub struct SelectionHandle {
  priv selector : @mmdb.FieldSelector?
  priv error : String?
}

///|
#export_name("prepare_fields")
pub fn prepare_fields(paths : Array[String]) -> SelectionHandle {
  { selector: Some(@mmdb.prepare_fields(paths)), error: None, } catch {
    e => { selector: None, error: Some(e.to_json().stringify()), }
  }
}

///|
#export_name("selection_status")
pub fn selection_status(selection : SelectionHandle) -> String {
  match selection.error {
    Some(error) => error
    None => {
      let result : Json = { "status": "valid" }
      result.stringify()
    }
  }
}

///|
#export_name("project_prepared")
pub fn project_prepared(
  handle : Handle,
  ip : String,
  selection : SelectionHandle,
) -> String {
  match selection.selector {
    None => selection.error.unwrap()
    Some(selector) =>
      match handle.reader {
        Some(reader) =>
          reader.project_prepared(ip, selector).to_json().stringify() catch {
            e => e.to_json().stringify()
          }
        None => handle.error.unwrap()
      }
  }
}

///|
#export_name("compare_prepared")
pub fn compare_prepared(
  before : Handle,
  after : Handle,
  ip : String,
  selection : SelectionHandle,
) -> String {
  match selection.selector {
    None => selection.error.unwrap()
    Some(selector) =>
      match (before.reader, after.reader) {
        (Some(a), Some(b)) =>
          a.compare_prepared(b, ip, selector).to_json().stringify() catch {
            e => e.to_json().stringify()
          }
        (None, _) => before.error.unwrap()
        (_, None) => after.error.unwrap()
      }
  }
}
