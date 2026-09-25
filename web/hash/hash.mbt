///|
#export_name("hash_create")
pub fn hash_create() -> @crypto.SHA256 { @crypto.SHA256::new() }

///|
#export_name("hash_update")
pub fn hash_update(hash : @crypto.SHA256, bytes : Bytes) -> Unit { hash.update(bytes) }

///|
#export_name("hash_finish")
pub fn hash_finish(hash : @crypto.SHA256) -> String {
  let hex = "0123456789abcdef"
  let result = StringBuilder()
  for b in hash.finalize() {
    result.write_char(hex[b.to_int() >> 4].to_char().unwrap())
    result.write_char(hex[b.to_int() & 15].to_char().unwrap())
  }
  result.to_string()
}
