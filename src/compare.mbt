///|
/// Typed comparison ignores map entry order but preserves array order and float bits.
fn same_value(left : Value, right : Value) -> Bool {
  match (left, right) {
    (Object(a), Object(b)) => {
      if a.length() != b.length() {
        return false
      }
      let indexed : Map[String, Value] = Map(b)
      for item in a {
        let (key, value) = item
        match indexed.get(key) {
          Some(other) => if !same_value(value, other) { return false }
          None => return false
        }
      }
      true
    }
    (List(a), List(b)) => {
      if a.length() != b.length() {
        return false
      }
      for i in 0..<a.length() {
        if !same_value(a[i], b[i]) {
          return false
        }
      }
      true
    }
    _ => left == right
  }
}

///|
/// Difference for one IP and selected paths, not an exhaustive database diff.
pub(all) struct RecordDiff {
  before : Projection
  after : Projection
  record_changed : Bool
  prefix_changed : Bool
  changed_fields : Array[String]
} derive(Eq, @debug.Debug)

///|
pub fn RecordDiff::changed(self : RecordDiff) -> Bool {
  self.record_changed || self.prefix_changed || !self.changed_fields.is_empty()
}

///|
fn diff_projections(before : Projection, after : Projection) -> RecordDiff {
  let changed_fields = []
  for i in 0..<before.fields.length() {
    let same = match (before.fields[i].1, after.fields[i].1) {
      (None, None) => true
      (Some(a), Some(b)) => same_value(a, b)
      _ => false
    }
    if !same {
      changed_fields.push(before.fields[i].0)
    }
  }
  {
    before,
    after,
    record_changed: before.record_found != after.record_found,
    prefix_changed: before.prefix_length != after.prefix_length,
    changed_fields,
  }
}

///|
pub fn Reader::compare(
  self : Reader,
  other : Reader,
  ip : String,
  paths : Array[String],
) -> RecordDiff raise MmdbError {
  self.compare_prepared(other, ip, prepare_fields(paths))
}

///|
/// Both readers apply their own budgets. Failed queries never become a clean diff.
pub fn Reader::compare_prepared(
  self : Reader,
  other : Reader,
  ip : String,
  selector : FieldSelector,
) -> RecordDiff raise MmdbError {
  let before = self.project_prepared(ip, selector) catch {
    e =>
      raise MmdbError(e.code(), e.offset(), "before database: " + e.message())
  }
  let after = other.project_prepared(ip, selector) catch {
    e => raise MmdbError(e.code(), e.offset(), "after database: " + e.message())
  }
  diff_projections(before, after)
}

///|
pub fn RecordDiff::to_json(self : RecordDiff) -> Json {
  {
    "status": (if self.changed() { "changed" } else { "unchanged" }).to_json(),
    "record_changed": self.record_changed.to_json(),
    "prefix_changed": self.prefix_changed.to_json(),
    "changed_fields": self.changed_fields.to_json(),
    "before": self.before.to_json(),
    "after": self.after.to_json(),
  }
}
