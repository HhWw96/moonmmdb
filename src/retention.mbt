///|
// A prepared, private path trie decides only which decoded values are retained.
// Every encoded field is still decoded and validated under the same budget.
priv struct SelectionTrie {
  mut terminal : Bool
  children : Map[String, SelectionTrie]
}

///|
priv enum Retention {
  All
  RetainFields(SelectionTrie)
  Discard
}

///|
// The immutable sentinel never escapes projection: a selected complete value
// uses All; omitted branches cannot be returned by any prepared pointer.
let discarded_value : Value = Boolean(false)

///|
fn selection_retention(tokens : Array[Array[String]]) -> Retention {
  let root : SelectionTrie = { terminal: false, children: Map([]), }
  for path in tokens {
    let mut node = root
    for token in path {
      let child = match node.children.get(token) {
        Some(child) => child
        None => {
          let child : SelectionTrie = { terminal: false, children: Map([]), }
          node.children[token] = child
          child
        }
      }
      node = child
    }
    node.terminal = true
  }
  if root.terminal {
    All
  } else {
    RetainFields(root)
  }
}

///|
fn retained_child(retention : Retention, key : String) -> Retention {
  match retention {
    All => All
    Discard => Discard
    RetainFields(node) =>
      match node.children.get(key) {
        None => Discard
        Some(child) => if child.terminal { All } else { RetainFields(child) }
      }
  }
}
