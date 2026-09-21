///|
test "consumer uses public typed adapters and preserves schema errors" {
  let record = @geo.AsnRecord::from_value(
    @mmdb.Object([
      ("autonomous_system_number", @mmdb.Unsigned32(64512)),
      ("autonomous_system_organization", @mmdb.Text("Synthetic")),
    ]),
  )
  assert_eq(record.autonomous_system_number, Some(64512U))
  let path = try {
    ignore(
      @geo.CityRecord::from_value(
        @mmdb.Object([("country", @mmdb.Text("wrong"))]),
      ),
    )
    None
  } catch {
    e => e.path()
  }
  assert_eq(path, Some("/country"))
}
