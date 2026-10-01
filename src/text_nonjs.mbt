///|
fn text_range(data : Bytes, start : Int, size : Int) -> String raise MmdbError {
  @utf8.decode(data[start:start + size], ignore_bom=false) catch {
    _ => raise MmdbError("invalid-utf8", start, "String is not valid UTF-8")
  }
}

///|
fn text_range_into(ctx : Decode, start : Int, size : Int) -> String {
  text_range(ctx.data, start, size) catch {
    error => {
      ctx.failure = Some(error)
      ""
    }
  }
}
