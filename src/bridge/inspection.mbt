///|
pub struct NetworkHandle {
  priv cursor : @mmdb.NetworkCursor?
  priv error : String?
}

///|
#export_name("prepare_networks")
pub fn prepare_networks(
  handle : Handle,
  cidr : String,
  max_records : Int,
  max_work : Int,
) -> NetworkHandle {
  match handle.reader {
    None => { cursor: None, error: handle.error, }
    Some(reader) =>
      {
        cursor: Some(reader.networks(cidr, limits={ max_records, max_work, })),
        error: None,
      } catch {
        e => { cursor: None, error: Some(e.to_json().stringify()), }
      }
  }
}

///|
#export_name("next_network")
pub fn next_network(handle : NetworkHandle) -> String {
  match handle.cursor {
    None => handle.error.unwrap()
    Some(cursor) =>
      try {
        match cursor.next() {
          None => {
            let end : Json = { "status": "end" }
            end.stringify()
          }
          Some(record) => record.to_json().stringify()
        }
      } catch {
        e => e.to_json().stringify()
      }
  }
}

///|
#export_name("network_stats")
pub fn network_stats(handle : NetworkHandle) -> String {
  match handle.cursor {
    None => handle.error.unwrap()
    Some(cursor) => {
      let result : Json = {
        "records": cursor.emitted_count().to_json(),
        "work_used": cursor.work_used().to_json(),
      }
      result.stringify()
    }
  }
}

///|
#export_name("close_networks")
pub fn close_networks(handle : NetworkHandle) -> Unit {
  if handle.cursor is Some(cursor) {
    cursor.close()
  }
}

///|
#export_name("validate_database")
pub fn validate_database(
  handle : Handle,
  decode_data : Bool,
  max_work : Int,
  max_state_bytes : Int,
) -> String {
  match handle.reader {
    None => handle.validation_error.unwrap()
    Some(reader) =>
      reader
      .validate(decode_data~, limits={ max_work, max_state_bytes, })
      .to_json()
      .stringify() catch {
        e => e.to_validation_json().stringify()
      }
  }
}
