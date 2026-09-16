///|
#borrow(path)
extern "C" fn read_host(path : Bytes, limit : Int) -> Bytes = "moonmmdb_probe_read"

///|
extern "C" fn read_error() -> Int = "moonmmdb_probe_error"

///|
#borrow(fallback)
extern "C" fn host_arg(index : Int, fallback : String) -> String = "moonmmdb_probe_arg"

///|
extern "C" fn now_ms() -> Double = "moonmmdb_probe_now"

///|
extern "C" fn exit_process(code : Int) -> Unit = "exit"

///|
fn read_file(path : String, limit : Int) -> Bytes {
  let result = read_host(@utf8.encode((path + "\u{0000}")[:]), limit)
  if read_error() != 0 {
    let error : Json = {
      "status": "error",
      "code": "host-input-error",
      "io_code": read_error().to_json(),
    }
    println(error.stringify())
    exit_process(2)
  }
  result
}

///|
fn main {
  let args = @env.args()
  if args.length() != 3 {
    println("Usage: native_probe DATABASE.mmdb IPS.txt")
    exit_process(2)
  }
  let bytes = read_file(host_arg(1, args[1]), 268435456)
  let text = @utf8.decode(read_file(host_arg(2, args[2]), 8388608)[:]) catch {
    _ => {
      println("invalid UTF8 IP list")
      exit_process(2)
      ""
    }
  }
  let ips = text
    .replace_all(old="\r\n", new="\n")
    .split("\n")
    .filter(ip => !ip.is_empty())
    .map(ip => ip.to_owned())
    .to_array()
  try {
    let started = now_ms()
    let reader = @mmdb.open_bytes(bytes)
    let open_ms = now_ms() - started
    let opened : Json = {
      "status": "opened",
      "metadata": reader.metadata().raw.to_tagged_json(),
      "open_ms": open_ms.to_json(),
    }
    println(opened.stringify())
    let paths = [
      "/country/iso_code", "/country/names/zh-CN", "/city/names/en", "/location/latitude",
      "/autonomous_system_number", "/autonomous_system_organization", "/absent",
    ]
    let query_started = now_ms()
    for ip in ips {
      let lookup = reader.lookup(ip).to_json() catch { e => e.to_json() }
      let projection = reader.project(ip, paths).to_json() catch {
          e => e.to_json()
        }
      let row : Json = {
        "ip": ip.to_json(),
        "lookup": lookup,
        "projection": projection,
      }
      println(row.stringify())
    }
    let result : Json = {
      "status": "complete",
      "queries": ips.length().to_json(),
      "elapsed_ms": (now_ms() - query_started).to_json(),
    }
    println(result.stringify())
  } catch {
    e => {
      println(e.to_json().stringify())
      exit_process(2)
    }
  }
}
