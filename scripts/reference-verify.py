"""Compare the actual MoonBit build with pinned official Python and C readers."""
import datetime
import hashlib
import ipaddress
import json
import math
import os
from pathlib import Path
import random
import struct
import subprocess
import sys

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / '.reference-deps'))
import maxminddb

if maxminddb.__version__ != '3.2.0':
    raise RuntimeError('Install maxminddb==3.2.0 (requirements-reference.txt)')

def plain(tag):
    kind, value = tag['type'], tag['value']
    if kind in ('uint16','uint32','int32','uint64','uint128'): return int(value)
    if kind == 'bytes': return bytes.fromhex(value)
    if kind in ('float32','float64'):
        size = 4 if kind == 'float32' else 8
        return struct.unpack('>f' if size == 4 else '>d', int(tag['bits'],16).to_bytes(size,'big'))[0]
    if kind == 'array': return [plain(v) for v in value]
    if kind == 'map': return {k:plain(v) for k,v in value.items()}
    return value

def main():
    fixtures = ROOT / 'tests/fixtures'
    manifest = json.loads((fixtures / 'manifest.json').read_text())
    requests, expected, metadata_expected = [], [], {}
    rng = random.Random(0x4D4D4442)
    for entry in manifest['files']:
        file = entry['file']
        if hashlib.sha256((fixtures / file).read_bytes()).hexdigest() != entry['sha256']:
            raise RuntimeError('Fixture hash mismatch: ' + file)
        with maxminddb.open_database(str(fixtures/file), maxminddb.MODE_MEMORY) as reader:
            meta = reader.metadata()
            metadata_expected[file] = {'node_count':meta.node_count, 'record_size':meta.record_size, 'ip_version':meta.ip_version, 'database_type':meta.database_type, 'binary_format_major_version':meta.binary_format_major_version, 'binary_format_minor_version':meta.binary_format_minor_version, 'build_epoch':meta.build_epoch}
            addresses = {'0.0.0.0','255.255.255.255','1.1.1.1','1.1.1.3'}
            if meta.ip_version == 6: addresses.update(['::','::1','ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff','::ffff:1.1.1.1','2002:0101:0101::'])
            # Two special fixtures expose bugs in the reference network iterator.
            # Still probe deterministic addresses; metadata-pointers is metadata-only.
            entries = [] if file in ('MaxMind-DB-test-metadata-pointers.mmdb','MaxMind-DB-no-ipv4-search-tree.mmdb') else reader
            for network, _ in entries:
                for n in (int(network.network_address), int(network.broadcast_address), int(network.network_address)-1, int(network.broadcast_address)+1):
                    if 0 <= n < (1 << network.max_prefixlen):
                        address = ipaddress.IPv4Address(n) if network.version == 4 else ipaddress.IPv6Address(n)
                        addresses.add(str(address))
                        if network.version == 6 and n < (1 << 32): addresses.add(str(ipaddress.IPv4Address(n)))
            for _ in range(64):
                addresses.add(str(ipaddress.IPv4Address(rng.getrandbits(32))))
                if meta.ip_version == 6: addresses.add(str(ipaddress.IPv6Address(rng.getrandbits(128))))
            requests.append({'file':file,'operation':'metadata'})
            expected.append(('metadata', metadata_expected[file]))
            if file == 'MaxMind-DB-test-metadata-pointers.mmdb': continue
            for ip in sorted(addresses):
                value, prefix = reader.get_with_prefix_len(ip)
                requests.append({'file':file,'ip':ip})
                expected.append(('lookup',value,prefix))
                paths=['/ip','/autonomous_system_number','/country/iso_code','/location/latitude','/array/1','/uint128','/absent']
                fields={}
                for path in paths:
                    selected=value
                    for token in path[1:].split('/'):
                        if isinstance(selected,dict): selected=selected.get(token)
                        elif isinstance(selected,list) and token.isdecimal() and int(token)<len(selected): selected=selected[int(token)]
                        else: selected=None
                    fields[path]=selected
                requests.append({'file':file,'ip':ip,'operation':'project','paths':paths})
                expected.append(('project',value is not None,prefix,fields))
    run = subprocess.run([os.environ.get('NODE','node'),str(ROOT/'scripts/query-driver.mjs')], input=json.dumps(requests), text=True, capture_output=True, encoding='utf-8', timeout=90)
    if run.returncode: raise RuntimeError(run.stderr)
    actual = json.loads(run.stdout)
    if len(actual) != len(expected): raise RuntimeError('Response count mismatch')
    failures = []
    for request, exp, got in zip(requests, expected, actual):
        try:
            if exp[0] == 'metadata':
                assert got['status'] == 'opened'
                normalized = plain(got['metadata'])
                assert all(normalized.get(k) == v for k,v in exp[1].items())
            elif exp[0]=='project':
                assert got['status']==('found' if exp[1] else 'not_found')
                assert got['prefix_length']==exp[2]
                assert set(got['fields'])==set(exp[3])
                for path,value in exp[3].items():
                    assert got['fields'][path]['status']==('missing' if value is None else 'present')
                    if value is not None: assert plain(got['fields'][path]['value'])==value
            else:
                assert got['status'] == ('not_found' if exp[1] is None else 'found')
                assert got['prefix_length'] == exp[2]
                assert (None if got['record'] is None else plain(got['record'])) == exp[1]
        except (AssertionError, KeyError, ValueError) as error:
            failures.append({'request':request,'actual':got,'expected':repr(exp),'error':str(error)})
    # The C extension in this environment requires ASCII relative fixture paths.
    os.chdir(fixtures)
    handles = {}
    c_count = 0
    disagreements = []
    try:
        for request, exp in zip(requests, expected):
            if exp[0] != 'lookup': continue
            file = request['file']
            if file not in handles: handles[file] = maxminddb.open_database(file,maxminddb.MODE_MMAP_EXT)
            value, prefix = handles[file].get_with_prefix_len(request['ip'])
            c_count += 1
            if value != exp[1] or prefix != exp[2]:
                known = (sys.platform == 'win32' and file == 'MaxMind-DB-test-decoder.mmdb' and request['ip'] == '255.255.255.255' and prefix == exp[2] and isinstance(value,dict) and value.get('uint32') == -1 and exp[1].get('uint32') == 4294967295 and {**value,'uint32':4294967295} == exp[1])
                discrepancy = {'request':request,'c_actual':repr(value),'python_expected':repr(exp[1]),'known_windows_uint32_boundary':known}
                disagreements.append(discrepancy)
                if not known: failures.append({'request':request,'error':'Unclassified Python/C reference disagreement',**discrepancy})
    finally:
        for reader in handles.values(): reader.close()
    out = ROOT / 'verification/local/reference.json'
    out.parent.mkdir(parents=True,exist_ok=True)
    report = {'timestamp':datetime.datetime.now(datetime.timezone.utc).isoformat(),'status':'failed' if failures else ('passed-with-reference-disagreement' if disagreements else 'passed'),'tested_implementation':'MoonMMDB 0.1.0 MoonBit JavaScript release build','reference_version':maxminddb.__version__,'fixtures':len(manifest['files']),'moonbit_checks':len(requests),'c_reference_checks':c_count,'secondary_reference_disagreements':disagreements,'coverage_limits':['metadata-pointers: metadata only','no-ipv4-search-tree: deterministic address probes; reference iterator fails on network prefix','no full commercial database or production workload tested'],'seed':'0x4D4D4442','failure_count':len(failures),'failures':failures,'requests':requests}
    out.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({k:v for k,v in report.items() if k not in ('requests','failures')},ensure_ascii=True))
    for failure in failures[:5]: print(json.dumps(failure,ensure_ascii=True))
    if failures: raise SystemExit(1)

if __name__ == '__main__': main()
