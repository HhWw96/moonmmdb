"""Complete pinned MMDB inventory with independent valid-data reference and bounded policy probes.

Reference enumeration runs in a separate process with a timeout, only for
explicitly classified fixtures. Malformed/resource fixtures never enter it.
"""
import argparse
import datetime
import hashlib
import importlib.util
import ipaddress
import json
import os
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parent.parent
FIXTURES = ROOT / 'tests/fixtures'
manifest = json.loads((FIXTURES / 'corpus.json').read_text())
parser = argparse.ArgumentParser()
parser.add_argument('--native', action='store_true')
parser.add_argument('--oracle', type=int)
args = parser.parse_args()
sys.path.insert(0, str(ROOT / '.reference-deps'))
import maxminddb
assert maxminddb.__version__ == '3.2.0'

if args.oracle is not None:
    entry = manifest['files'][args.oracle]
    assert entry['mode'] == 'reference', 'Never use the unbounded oracle on policy fixtures'
    with maxminddb.open_database(str(FIXTURES / entry['path']), maxminddb.MODE_MEMORY) as reader:
        meta = reader.metadata()
        metadata = {k: getattr(meta, k) for k in ('node_count','record_size','ip_version','database_type','binary_format_major_version','binary_format_minor_version','build_epoch')}
        ips = {'0.0.0.0','255.255.255.255','1.1.1.1','128.0.0.1'}
        if meta.ip_version == 6: ips.update(['::','::1','ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff','::ffff:1.1.1.1'])
        if entry.get('address_source'):
            content = (FIXTURES/entry['address_source']).read_bytes()
            assert hashlib.sha256(content).hexdigest()==entry['address_source_sha256']
            for record in json.loads(content):
                for cidr in record:
                    network=ipaddress.ip_network(cidr)
                    for n in (int(network.network_address)-1,int(network.network_address),int(network.broadcast_address),int(network.broadcast_address)+1):
                        if 0 <= n < (1 << network.max_prefixlen):
                            ips.add(str(ipaddress.IPv4Address(n) if network.version==4 else ipaddress.IPv6Address(n)))
                            if n < (1 << 32): ips.add(str(ipaddress.IPv4Address(n)))
        if entry.get('iterate', True) and not entry.get('metadata_only'):
            for network, _ in reader:
                for n in (int(network.network_address)-1, int(network.network_address), int(network.broadcast_address), int(network.broadcast_address)+1):
                    if 0 <= n < (1 << network.max_prefixlen):
                        ips.add(str(ipaddress.IPv4Address(n) if network.version == 4 else ipaddress.IPv6Address(n)))
                if len(ips) > 8192: raise RuntimeError('Reference address enumeration exceeded fixture cap')
        if entry.get('metadata_only'): ips = set()
        # Encode reference bytes and floats using Python's exact-value transport.
        import pickle
        import base64
        payload = {'metadata': metadata, 'queries': [(ip, reader.get_with_prefix_len(ip)) for ip in sorted(ips)]}
        print(base64.b64encode(pickle.dumps(payload)).decode())
    raise SystemExit()

spec = importlib.util.spec_from_file_location('oracle_normalization', ROOT / 'scripts/reference-verify.py')
reference = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reference)
report = {'started': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'status': 'running', 'target': 'native' if args.native else 'js', 'commit': manifest['commit'], 'scope': manifest['scope'], 'reference': 'maxminddb 3.2.0 MODE_MEMORY', 'files': [], 'query_checks': 0}
exe = ROOT / 'dist' / ('moonmmdb.exe' if os.name == 'nt' else 'moonmmdb')
artifact = exe if args.native else ROOT / 'dist/core.mjs'
report['artifact_sha256'] = hashlib.sha256(artifact.read_bytes()).hexdigest()

def run(command, **kw):
    result = subprocess.run(command, cwd=ROOT, capture_output=True, text=True, encoding='utf-8', timeout=15, **kw)
    if result.returncode not in (0, 1, 2): raise RuntimeError('Unexpected process exit: '+str(result.returncode))
    return result

def probe(entry, ips):
    file = str(FIXTURES / entry['path'])
    if not args.native:
        result = run([os.environ.get('NODE', 'node'), '--max-old-space-size=256', str(ROOT/'scripts/corpus-worker.mjs')], input=json.dumps({'file':file,'ips':ips,'policy':entry['mode']=='policy'}))
        assert result.returncode == 0, result.stderr[-1000:]
        return json.loads(result.stdout)
    meta = run([str(exe), 'metadata', file])
    opened = json.loads(meta.stdout or meta.stderr)
    assert meta.returncode == (0 if opened['status']=='opened' else 2)
    queries = []
    if opened['status'] == 'opened':
        for start in range(0, len(ips), 32):
            result = run([str(exe), 'lookup', file, *ips[start:start+32]])
            rows = [json.loads(line) for line in (result.stdout or result.stderr).splitlines()]
            assert len(rows) == len(ips[start:start+32]), 'Incomplete output'
            expected_code = max(2 if r['status']=='error' else 1 if r['status']=='not_found' else 0 for r in rows)
            assert result.returncode == expected_code, 'Exit priority mismatch'
            queries.extend(rows)
    return {'opened':opened, 'queries':queries}

try:
    tracked = {e['path'] for e in manifest['files']}
    actual = {str(p.relative_to(FIXTURES)).replace('\\','/') for p in FIXTURES.rglob('*.mmdb')}
    assert tracked == actual and len(tracked) == 73, 'Unclassified or absent MMDB fixture'
    for index, entry in enumerate(manifest['files']):
        assert hashlib.sha256((FIXTURES/entry['path']).read_bytes()).hexdigest() == entry['sha256']
        row = {'file':entry['source_path'],'mode':entry['mode'],'status':'passed'}
        try:
            if entry['mode'] == 'reference':
                # This payload is created locally by this script, never read from a database as pickle.
                import base64, pickle
                oracle = run([sys.executable, '-X', 'utf8', str(Path(__file__).resolve()), '--oracle', str(index)])
                assert oracle.returncode == 0, oracle.stderr[-1000:]
                expected = pickle.loads(base64.b64decode(oracle.stdout))
                ips = [q[0] for q in expected['queries']]
                actual = probe(entry, ips)
                assert actual['opened']['status'] == 'opened', actual['opened']
                metadata = reference.plain(actual['opened']['metadata'])
                assert all(metadata.get(k)==v for k,v in expected['metadata'].items()), 'Metadata mismatch'
                assert len(actual['queries']) == len(ips)
                for (ip, (value, prefix)), got in zip(expected['queries'], actual['queries']):
                    assert got['status'] == ('not_found' if value is None else 'found'), (ip,got.get('code'))
                    assert got['prefix_length'] == prefix, (ip,'prefix mismatch')
                    assert (None if got['record'] is None else reference.plain(got['record'])) == value, (ip,'record mismatch')
                row['queries'] = len(ips)
            else:
                actual = probe(entry, [entry['ip']])
                got = actual['opened'] if actual['opened']['status']=='error' else actual['queries'][0]
                if entry['expected_code'] is None: assert got['status']=='found', got.get('code')
                else: assert got['status']=='error' and got['code']==entry['expected_code'], (got.get('status'),got.get('code'))
                row['queries'] = 1
                row['expected_code'] = entry['expected_code']
            report['query_checks'] += row['queries']
        except Exception as error:
            row.update(status='failed', error=str(error)[:2000])
        report['files'].append(row)
    raw = (FIXTURES/manifest['raw']['path']).read_bytes()
    assert hashlib.sha256(raw).hexdigest() == manifest['raw']['sha256']
    from maxminddb.decoder import Decoder
    offsets=[0,22,37,50,55,57]; ends=[22,37,50,55,57,59]
    keys=['long_key','long_key','long_key2','long_key2','long_key','long_key2'];values=['long_value1','long_value2','long_value1','long_value2','long_value1','long_value2']
    for i, offset in enumerate(offsets): assert Decoder(raw,0).decode(offset) == ({keys[i]:values[i]},ends[i])
    report['raw_reference_checks'] = 6
    report['status'] = 'passed' if all(r['status']=='passed' for r in report['files']) else 'failed'
except Exception as error:
    report.update(status='failed', error=str(error))
report['finished'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
output = ROOT / ('verification/local/corpus-native.json' if args.native else 'verification/local/corpus.json')
output.write_text(json.dumps(report, indent=2)+'\n', encoding='utf-8')
print(json.dumps({k:v for k,v in report.items() if k!='files'}))
for row in report['files']:
    if row['status']!='passed': print(json.dumps(row))
sys.exit(0 if report['status']=='passed' else 1)
