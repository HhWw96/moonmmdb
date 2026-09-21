///|
// Standard SHA-256 vectors; the vendored compatibility edit does not touch SHA-256.
test "SHA256 vectors and multi-block input" {
  assert_eq(
    @crypto.bytes_to_hex_string(@crypto.sha256(b"")),
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  )
  assert_eq(
    @crypto.bytes_to_hex_string(@crypto.sha256(b"abc")),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  )
  assert_eq(
    @crypto.bytes_to_hex_string(@crypto.sha256(Bytes::make(1000000, b'a'))),
    "cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0",
  )
}

///|
test "JSON nesting and canonical array indices" {
  let nested = "[".repeat(130) + "0" + "]".repeat(130)
  try parse(nested, "invalid-jsonl") catch {
    CliError(code, _, _) => assert_eq(code, "invalid-jsonl")
  } noraise {
    _ => fail("test-failed", "Expected nesting limit")
  }
  let row = parse("{\"a\":[{\"ip\":\"1.1.1.1\"}]}", "invalid-jsonl")
  assert_eq(select_ip(row, ["a", "0", "ip"]), "1.1.1.1")
  try select_ip(row, ["a", "00", "ip"]) catch {
    CliError(code, _, _) => assert_eq(code, "invalid-jsonl")
  } noraise {
    _ => fail("test-failed", "Expected canonical index validation")
  }
}
