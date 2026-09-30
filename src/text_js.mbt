///|
// Strict UTF-8 decoding needs only the string. Avoid allocating a MoonBit
// BytesView and a success-result array for every MMDB text value. The codec is
// stateless between calls: no streaming mode or retained database payload.
extern "js" fn text_range_js(data : Bytes, start : Int, size : Int) -> String =
  #| (function() {
  #|   const codec = new TextDecoder('utf-8', {fatal: true, ignoreBOM: true});
  #|   return function(data, start, size) {
  #|     // Short ASCII keys and values need no temporary typed-array view.
  #|     if (size <= 8) {
  #|       let ascii = true;
  #|       for (let i = 0; i < size; i++) if (data[start + i] >= 128) { ascii = false; break; }
  #|       if (ascii) switch (size) {
  #|         case 0: return '';
  #|         case 1: return String.fromCharCode(data[start]);
  #|         case 2: return String.fromCharCode(data[start], data[start + 1]);
  #|         case 3: return String.fromCharCode(data[start], data[start + 1], data[start + 2]);
  #|         case 4: return String.fromCharCode(data[start], data[start + 1], data[start + 2], data[start + 3]);
  #|         case 5: return String.fromCharCode(data[start], data[start + 1], data[start + 2], data[start + 3], data[start + 4]);
  #|         case 6: return String.fromCharCode(data[start], data[start + 1], data[start + 2], data[start + 3], data[start + 4], data[start + 5]);
  #|         case 7: return String.fromCharCode(data[start], data[start + 1], data[start + 2], data[start + 3], data[start + 4], data[start + 5], data[start + 6]);
  #|         case 8: return String.fromCharCode(data[start], data[start + 1], data[start + 2], data[start + 3], data[start + 4], data[start + 5], data[start + 6], data[start + 7]);
  #|       }
  #|     }
  #|     try { return codec.decode(data.subarray(start, start + size)); }
  #|     catch (_) { return ''; }
  #|   };
  #| })()

///|
fn text_range(data : Bytes, start : Int, size : Int) -> String raise MmdbError {
  let text = text_range_js(data, start, size)
  // A nonempty, valid UTF-8 sequence cannot decode to an empty string when
  // the BOM is preserved. Empty input remains a valid empty MMDB string.
  if size != 0 && text.is_empty() {
    // Keep the established strict decoder on the exceptional path too.
    return @utf8.decode(data[start:start + size], ignore_bom=false) catch {
      _ => raise MmdbError("invalid-utf8", start, "String is not valid UTF-8")
    }
  }
  text
}
