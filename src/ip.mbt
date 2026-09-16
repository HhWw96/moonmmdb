///|
/// IP parsing is strict: no DNS, zones, CIDR suffixes, brackets or octal IPv4.
priv struct Address {
  bytes : Array[Int]
  version : Int
}

///|
fn ipv4(text : String) -> Array[Int] raise MmdbError {
  let parts = text.split(".").to_array()
  if parts.length() != 4 {
    raise MmdbError("invalid-ip", -1, "Expected four IPv4 octets")
  }
  let result : Array[Int] = []
  for part in parts {
    if part.length() == 0 ||
      part.length() > 3 ||
      (part.length() > 1 && part[0] == '0') {
      raise MmdbError("invalid-ip", -1, "Invalid IPv4 octet")
    }
    let mut number = 0
    for ch in part {
      if ch < '0' || ch > '9' {
        raise MmdbError("invalid-ip", -1, "Non-decimal IPv4 octet")
      }
      number = number * 10 + ch.to_int() - 48
    }
    if number > 255 {
      raise MmdbError("invalid-ip", -1, "IPv4 octet exceeds 255")
    }
    result.push(number)
  }
  result
}

///|
fn hex_group(text : StringView) -> Int raise MmdbError {
  if text.length() == 0 || text.length() > 4 {
    raise MmdbError("invalid-ip", -1, "Invalid IPv6 group")
  }
  let mut value = 0
  for ch in text {
    let digit = if ch >= '0' && ch <= '9' {
      ch.to_int() - 48
    } else if ch >= 'a' && ch <= 'f' {
      ch.to_int() - 87
    } else if ch >= 'A' && ch <= 'F' {
      ch.to_int() - 55
    } else {
      raise MmdbError("invalid-ip", -1, "Invalid IPv6 digit")
    }
    value = value * 16 + digit
  }
  value
}

///|
fn ipv6_groups(
  text : StringView,
  allow_v4 : Bool,
) -> Array[Int] raise MmdbError {
  if text.is_empty() {
    return []
  }
  let parts = text.split(":").to_array()
  let result : Array[Int] = []
  for i in 0..<parts.length() {
    let p = parts[i]
    if p.contains(".") {
      if !allow_v4 || i != parts.length() - 1 {
        raise MmdbError("invalid-ip", -1, "IPv4 tail must be last")
      }
      let tail = ipv4(p.to_owned())
      result.push(tail[0] * 256 + tail[1])
      result.push(tail[2] * 256 + tail[3])
    } else {
      result.push(hex_group(p))
    }
  }
  result
}

///|
fn parse_ip(text : String) -> Address raise MmdbError {
  if text.length() == 0 || text.length() > 45 {
    raise MmdbError("invalid-ip", -1, "Invalid IP length")
  }
  if !text.contains(":") {
    return { bytes: ipv4(text), version: 4, }
  }
  let halves = text.split("::").to_array()
  let groups : Array[Int] = []
  if halves.length() == 1 {
    let whole = ipv6_groups(text[:], true)
    if whole.length() != 8 {
      raise MmdbError("invalid-ip", -1, "Expected eight IPv6 groups")
    }
    for n in whole {
      groups.push(n)
    }
  } else if halves.length() == 2 {
    let left = ipv6_groups(halves[0], false)
    let right = ipv6_groups(halves[1], true)
    if left.length() + right.length() >= 8 {
      raise MmdbError("invalid-ip", -1, "Compression must omit a group")
    }
    for n in left {
      groups.push(n)
    }
    for _ in 0..<(8 - left.length() - right.length()) {
      groups.push(0)
    }
    for n in right {
      groups.push(n)
    }
  } else {
    raise MmdbError("invalid-ip", -1, "Multiple IPv6 compressions")
  }
  let bytes : Array[Int] = []
  for n in groups {
    bytes.push(n >> 8)
    bytes.push(n & 255)
  }
  { bytes, version: 6, }
}
