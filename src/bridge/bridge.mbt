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
