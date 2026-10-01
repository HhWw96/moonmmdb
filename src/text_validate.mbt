///|
// Eagerly decode the UTF-8 scalar boundaries for an unretained text value.
// No field or byte sequence is deferred; materializing a String is unnecessary
// when no prepared pointer can return it. Bounds are checked by the decoder.
fn valid_text_range(data : Bytes, start : Int, size : Int) -> Bool {
  let end = start + size
  let mut pos = start
  while pos < end {
    let first = data[pos].to_int()
    if first < 0x80 {
      pos += 1
      continue
    }
    let width = if first >= 0xc2 && first <= 0xdf {
      2
    } else if first >= 0xe0 && first <= 0xef {
      3
    } else if first >= 0xf0 && first <= 0xf4 {
      4
    } else {
      return false
    }
    if width > end - pos {
      return false
    }
    let second = data[pos + 1].to_int()
    if second < 0x80 || second > 0xbf {
      return false
    }
    if (first == 0xe0 && second < 0xa0) ||
      (first == 0xed && second > 0x9f) ||
      (first == 0xf0 && second < 0x90) ||
      (first == 0xf4 && second > 0x8f) {
      return false
    }
    for index in (pos + 2)..<(pos + width) {
      let byte = data[index].to_int()
      if byte < 0x80 || byte > 0xbf {
        return false
      }
    }
    pos += width
  }
  true
}
