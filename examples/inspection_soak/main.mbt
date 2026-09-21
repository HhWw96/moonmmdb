///|
extern "C" fn host_init() -> Unit = "mm_cli_init"

///|
#borrow(fallback)
extern "C" fn arg(index : Int, fallback : String) -> String = "mm_cli_arg"

///|
#borrow(path)
extern "C" fn read(path : Bytes, limit : Int) -> Bytes = "mm_cli_read"

///|
#borrow(path)
extern "C" fn input(path : Bytes, limit : Int, line_limit : Int) -> Unit = "mm_cli_open"

///|
extern "C" fn line(limit : Int) -> Bytes = "mm_cli_line"

///|
extern "C" fn error() -> Int = "mm_cli_error"

///|
extern "C" fn close() -> Unit = "mm_cli_close"

///|
extern "C" fn flush() -> Unit = "mm_soak_flush"

///|
fn main raise {
  host_init()
  let args = @env.args()
  let city_bytes = read(
    @utf8.encode((arg(1, args[1]) + "\u{0000}")[:]),
    268435456,
  )
  assert_eq(error(), 0)
  let asn_bytes = read(
    @utf8.encode((arg(2, args[2]) + "\u{0000}")[:]),
    268435456,
  )
  assert_eq(error(), 0)
  let city = @mmdb.open_bytes(city_bytes)
  let asn = @mmdb.open_bytes(asn_bytes)
  input(b"-\x00", 1048576, 128)
  assert_eq(error(), 0)
  while line(1048576).length() > 0 {
    assert_eq(error(), 0)
    for reader in [city, asn] {
      for ip in ["1.1.1.1", "8.8.8.8", "2001:4860:4860::8888"] {
        let cursor = reader.networks(
          ip + (if ip.contains(":") { "/128" } else { "/32" }),
        )
        let expected = reader.lookup(ip).value
        let observed = cursor.next().map(record => record.value)
        assert_eq(observed, expected)
        assert_eq(cursor.next(), None)
        cursor.close()
      }
      let abandoned = reader.networks("0.0.0.0/0")
      ignore(abandoned.next())
      abandoned.close()
      abandoned.close()
      assert_eq(abandoned.next(), None)
    }
    let checked = asn.validate(decode_data=true)
    let value : Json = {
      "status": "tick",
      "checked_nodes": checked.checked_nodes.to_json(),
      "decoded_records": checked.decoded_records.to_json(),
      "cursors": 8,
    }
    println(value.stringify())
    flush()
  }
  assert_eq(error(), -1)
  close()
}
