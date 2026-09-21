"""Import every MMDB and the raw pointer fixture from the pinned official archive.

This inventories test data, not a port of every language-specific reader test.
Hostile data is classified explicitly; never feed it to an unbounded oracle.
"""
import argparse
import hashlib
import io
import json
from pathlib import Path
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parent.parent
FIXTURES = ROOT / 'tests/fixtures'
base = json.loads((FIXTURES / 'manifest.json').read_text())
parser = argparse.ArgumentParser()
parser.add_argument('--archive', type=Path)
args = parser.parse_args()
content = args.archive.read_bytes() if args.archive else urllib.request.urlopen(base['source'], timeout=45).read()
assert hashlib.sha256(content).hexdigest() == base['archive_sha256'], 'Archive SHA mismatch'
existing = {entry['file']: {'path': entry['file'], 'mode': 'reference'} for entry in base['files']}
for folder in ('adversarial', 'boundary'):
    for entry in json.loads((FIXTURES / folder / 'manifest.json').read_text()):
        existing[entry['file']] = {'path': folder + '/' + entry['file'], 'mode': 'policy', 'ip': entry.get('ip', '1.1.1.1'), 'expected_code': entry['expected_code']}
policy = {
    'GeoIP2-City-Test-Broken-Double-Format.mmdb': ('89.160.20.112', 'invalid-size', 'Invalid encoded double length'),
    'GeoIP2-City-Test-Invalid-Node-Count.mmdb': ('1.1.1.1', 'invalid-layout', 'Declared search tree overlaps metadata'),
    'MaxMind-DB-test-broken-pointers-24.mmdb': ('1.1.1.16', 'out-of-bounds', 'Data pointer targets outside data section'),
    'MaxMind-DB-test-broken-search-tree-24.mmdb': ('255.255.255.255', 'invalid-tree', 'No terminal after all address bits'),
    'MaxMind-DB-test-decode-path-shared-budget.mmdb': ('1.1.1.1', 'duplicate-key', 'Reader rejects duplicate map keys before any projection; upstream decode-path budget behavior is not implemented'),
}
entries = []
with zipfile.ZipFile(io.BytesIO(content)) as archive:
    prefix = archive.namelist()[0].split('/')[0] + '/'
    for item in sorted(archive.namelist()):
        source = item.removeprefix(prefix)
        if not (source.startswith(('test-data/', 'bad-data/')) and source.endswith('.mmdb')):
            continue
        name = Path(source).name
        entry = dict(existing.get(name, {'path': 'upstream/' + source, 'mode': 'reference'}))
        if name in policy:
            ip, code, reason = policy[name]
            entry.update(mode='policy', ip=ip, expected_code=code, reason=reason)
        if name == 'MaxMind-DB-test-metadata-pointers.mmdb':
            entry['metadata_only'] = True
        if name in ('GeoIP-Anonymous-Plus-Test.mmdb', 'GeoIP2-Anonymous-IP-Test.mmdb'):
            source_json = 'source-data/' + name.removesuffix('.mmdb') + '.json'
            source_bytes = archive.read(prefix + source_json)
            target_json = FIXTURES / 'upstream' / source_json
            target_json.parent.mkdir(parents=True, exist_ok=True)
            target_json.write_bytes(source_bytes)
            entry.update(iterate=False, address_source='upstream/' + source_json, address_source_sha256=hashlib.sha256(source_bytes).hexdigest(), reason='Python 3.2.0 network iterator raises host-bits-set on IPv6 aliases; derive boundary addresses from pinned upstream source JSON, then use independent get_with_prefix_len')
        if name in ('MaxMind-DB-no-ipv4-search-tree.mmdb', 'libmaxminddb-corrupt-search-tree.mmdb'):
            entry['iterate'] = False
            entry['reason'] = 'Probe reachable paths only; this Reader does not certify every tree node'
        data = archive.read(item)
        target = FIXTURES / entry['path']
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.exists():
            assert target.read_bytes() == data, target
        else:
            target.write_bytes(data)
        entry.update(source_path=source, bytes=len(data), sha256=hashlib.sha256(data).hexdigest())
        entries.append(entry)
    raw = archive.read(prefix + 'test-data/maps-with-pointers.raw')
    (FIXTURES / 'maps-with-pointers.raw').write_bytes(raw)
    # Expected records come from the upstream raw sequence, also checked by Python.
    literal = ''.join('\\x%02x' % b for b in raw)
    code = '''// Official MaxMind maps-with-pointers.raw; Apache-2.0 OR MIT.
///|
test "official raw shared map pointers preserve record boundaries" {
  let data = b"LITERAL"
  let offsets = [0, 22, 37, 50, 55, 57]
  let ends = [22, 37, 50, 55, 57, 59]
  let keys = ["long_key", "long_key", "long_key2", "long_key2", "long_key", "long_key2"]
  let values = ["long_value1", "long_value2", "long_value1", "long_value2", "long_value1", "long_value2"]
  for i in 0..<offsets.length() {
    let (value, end) = decode(decoder(data, 0, data.length(), Limits::default()), offsets[i], 0)
    assert_eq(value, Object([(keys[i], Text(values[i]))]))
    assert_eq(end, ends[i])
  }
}
'''.replace('LITERAL', literal)
    (ROOT / 'src/raw_pointer_wbtest.mbt').write_text(code, encoding='utf-8')
# Reproduce the typed tests from the exact upstream files, split below compiler line limits.
lines = ['// Generated official MaxMind synthetic fixtures, Apache-2.0 OR MIT.']
for name, file in [('asn', 'GeoLite2-ASN-Test.mmdb'), ('city', 'GeoIP2-City-Test.mmdb')]:
    data = (FIXTURES / file).read_bytes()
    chunks = ['b"' + ''.join('\\x%02x' % b for b in data[i:i+1024]) + '"' for i in range(0, len(data), 1024)]
    lines += ['///|', f'fn {name}_fixture() -> Bytes {{', '  let chunks : Array[Bytes] = [', ',\n'.join(chunks), ']', f'  Bytes::makei({len(data)}, i => chunks[i / 1024][i % 1024])', '}', '']
(ROOT / 'src/geo/fixtures_wbtest.mbt').write_text('\n'.join(lines), encoding='utf-8')
assert len(entries) == 73 and len({e['source_path'] for e in entries}) == 73
report = {k: base[k] for k in ('source', 'commit', 'archive_sha256', 'license')}
report.update(scope='All 73 MMDB files and one raw decoder fixture at the pinned commit. File coverage is not branch coverage or a port of every upstream reader assertion.', files=entries, raw={'path': 'maps-with-pointers.raw', 'source_path': 'test-data/maps-with-pointers.raw', 'sha256': hashlib.sha256(raw).hexdigest(), 'records': 6})
(FIXTURES / 'corpus.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
print('Inventoried 73 official MMDB files and one raw pointer fixture.')
