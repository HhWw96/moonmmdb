///|
// Keep short fragments in bounded scratch storage, then join whole chunks.
// This avoids a retained chain of per-fragment JS concatenation nodes.
priv struct WireBuffer {
  parts : FixedArray[String]
  mut part_count : Int32
  chunks : Array[String]
}

///|
fn WireBuffer::new() -> WireBuffer {
  { parts: FixedArray::make(64, ""), part_count: 0, chunks: [], }
}

///|
#cfg(target="js")
extern "js" fn wire_join_fixed(parts : FixedArray[String]) -> String =
  #|(parts) => parts.join("")

///|
#cfg(not(target="js"))
fn wire_join_fixed(parts : FixedArray[String]) -> String {
  parts.join("")
}

///|
#cfg(target="js")
fn wire_join(parts : Array[String]) -> String {
  wire_join_fixed(FixedArray::from_array(parts[:]))
}

///|
#cfg(not(target="js"))
fn wire_join(parts : Array[String]) -> String {
  parts.join("")
}

///|
fn WireBuffer::flush(self : WireBuffer) -> Unit {
  if self.part_count > 0 {
    self.chunks.push(wire_join_fixed(self.parts))
    for i in 0..<self.part_count {
      self.parts[i] = ""
    }
    self.part_count = 0
  }
}

///|
fn WireBuffer::write_string(self : WireBuffer, text : String) -> Unit {
  if !text.is_empty() {
    self.parts[self.part_count] = text
    self.part_count = self.part_count + 1
    if self.part_count == 64 {
      self.flush()
    }
  }
}

///|
fn WireBuffer::write_char(self : WireBuffer, ch : Char) -> Unit {
  self.write_string(ch.to_string())
}

///|
fn WireBuffer::to_string(self : WireBuffer) -> String {
  if self.chunks.is_empty() {
    wire_join_fixed(self.parts)
  } else {
    self.flush()
    if self.chunks.length() == 1 {
      self.chunks[0]
    } else {
      wire_join(self.chunks)
    }
  }
}
