"""Check database diffs against independent Python lookups on pinned fixtures."""
import datetime
import hashlib
import ipaddress
import json
import random
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / '.reference-deps'))
import maxminddb

OUT = ROOT / 'verification/local/comparison.json'
FIXTURES = ROOT / 'tests/fixtures'
PATHS = ['', '/ip', '/absent']
MISSING = object()

def selected(record, path):
    if record is None:
        return MISSING
    if path == '':
        return record
    return record.get(path[1:], MISSING) if isinstance(record, dict) else MISSING

def expected(before, after, ip):
    a, ap = before.get_with_prefix_len(ip)
    b, bp = after.get_with_prefix_len(ip)
    record_changed = (a is None) != (b is None)
    prefix_changed = ap != bp
    fields = [p for p in PATHS if selected(a, p) != selected(b, p)]
    return {'status': 'changed' if record_changed or prefix_changed or fields else 'unchanged',
            'record_changed': record_changed, 'prefix_changed': prefix_changed,
            'changed_fields': fields, 'before_prefix': ap, 'after_prefix': bp,
            'before_found': a is not None, 'after_found': b is not None}

report = {'started': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'status': 'running',
          'reference': 'maxminddb 3.2.0 MODE_MEMORY', 'seed': '0x44494646', 'failures': []}
OUT.parent.mkdir(parents=True, exist_ok=True)
try:
    assert maxminddb.__version__ == '3.2.0'
    source = FIXTURES / 'MaxMind-DB-test-ipv4-24.mmdb'
    data = bytearray(source.read_bytes())
    offset = data.find(b'1.1.1.2')
    assert offset > 0
    data[offset] = ord('9')
    modified = OUT.parent / 'comparison-modified.mmdb'
    modified.write_bytes(data)
    rng = random.Random(0x44494646)
    v4 = [str(ipaddress.IPv4Address(0x01010100 + i)) for i in range(256)]
    v4 += [str(ipaddress.IPv4Address(rng.getrandbits(32))) for _ in range(64)]
    v4 += ['0.0.0.0', '255.255.255.255']
    v6 = ['::', '::1', '::1:ffff:ffff', '::2:0:1', 'ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff']
    v6 += [str(ipaddress.IPv6Address(rng.getrandbits(128))) for _ in range(128)]
    pairs = [
        (source, FIXTURES / 'MaxMind-DB-test-ipv4-32.mmdb', v4),
        (source, modified, v4),
        (source, FIXTURES / 'MaxMind-DB-test-ipv6-24.mmdb', v4),
        (FIXTURES / 'MaxMind-DB-test-ipv6-24.mmdb', FIXTURES / 'MaxMind-DB-test-ipv6-28.mmdb', v6),
    ]
    requests, expectations = [], []
    for a, b, ips in pairs:
        with maxminddb.open_database(str(a), maxminddb.MODE_MEMORY) as ra, maxminddb.open_database(str(b), maxminddb.MODE_MEMORY) as rb:
            for ip in ips:
                requests.append({'before': str(a), 'after': str(b), 'ip': ip, 'paths': PATHS})
                expectations.append(expected(ra, rb, ip))
    run = subprocess.run(['node', 'scripts/comparison-worker.mjs'], cwd=ROOT,
                         input=json.dumps(requests), text=True, encoding='utf-8', capture_output=True, timeout=60)
    if run.returncode:
        raise RuntimeError(run.stderr)
    actual = json.loads(run.stdout)
    assert len(actual) == len(expectations)
    for index, (row, want) in enumerate(zip(actual, expectations)):
        observed = {k: row.get(k) for k in ['status', 'record_changed', 'prefix_changed', 'changed_fields']}
        observed.update(before_prefix=row.get('before', {}).get('prefix_length'),
                        after_prefix=row.get('after', {}).get('prefix_length'),
                        before_found=row.get('before', {}).get('status') == 'found',
                        after_found=row.get('after', {}).get('status') == 'found')
        if observed != want:
            report['failures'].append({'request': requests[index], 'expected': want, 'actual': row})
    report.update(comparisons=len(requests), changed_cases=sum(x['status'] == 'changed' for x in expectations),
                  unchanged_cases=sum(x['status'] == 'unchanged' for x in expectations),
                  failure_count=len(report['failures']),
                  core_sha256=hashlib.sha256((ROOT / 'dist/core.mjs').read_bytes()).hexdigest(),
                  inputs={p.name: hashlib.sha256(p.read_bytes()).hexdigest() for pair in pairs for p in pair[:2]},
                  scope='Deterministic official layout fixtures, presence changes and an explicitly modified string record; not an exhaustive real database update comparison.')
    report['status'] = 'failed' if report['failures'] else 'passed'
except Exception as error:
    report.update(status='failed', error=str(error))
    raise
finally:
    report['finished'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    OUT.write_text(json.dumps(report, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    print(json.dumps({k: v for k, v in report.items() if k not in ('failures', 'inputs')}, ensure_ascii=True))
if report['status'] != 'passed':
    raise SystemExit(1)
