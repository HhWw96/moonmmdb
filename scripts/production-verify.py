"""Compare actual Native and JS readers with Python/C on pinned real DB-IP data."""
import argparse,datetime,hashlib,ipaddress,json,os,random,struct,subprocess,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/'verification/local/production.json'
sys.path.insert(0,str(ROOT/'.reference-deps'))
PATHS=['/country/iso_code','/country/names/zh-CN','/city/names/en','/location/latitude','/autonomous_system_number','/autonomous_system_organization','/absent']

def plain(tag):
    kind,value=tag['type'],tag['value']
    if kind in ('uint16','uint32','uint64','uint128','int32'): return int(value)
    if kind=='bytes': return bytes.fromhex(value)
    if kind in ('float32','float64'): return struct.unpack('>f' if kind=='float32' else '>d',int(tag['bits'],16).to_bytes(4 if kind=='float32' else 8,'big'))[0]
    if kind=='map': return {k:plain(v) for k,v in value.items()}
    if kind=='array': return [plain(v) for v in value]
    return value

def select(value,path):
    for token in path[1:].split('/'):
        value=value.get(token) if isinstance(value,dict) else None
    return value

def addresses(reader):
    rng=random.Random(0x50524f44)
    values={'0.0.0.0','255.255.255.255','1.1.1.1','8.8.8.8','9.9.9.9','114.114.114.114','10.0.0.1','127.0.0.1','172.16.0.1','192.168.1.1','169.254.0.1','224.0.0.1','240.0.0.1','::','::1','ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff','2001:4860:4860::8888','2606:4700:4700::1111','fe80::1','fc00::1','ff02::1','::ffff:8.8.8.8','2002:0808:0808::'}
    required=set(values)
    seeds=[ipaddress.IPv4Address(rng.getrandbits(32)) for _ in range(1000)]
    seeds += [ipaddress.IPv6Address((1<<125)|rng.getrandbits(125)) for _ in range(700)]
    seeds += [ipaddress.IPv6Address(rng.getrandbits(128)) for _ in range(300)]
    for ip in seeds:
        values.add(str(ip))
        _,prefix=reader.get_with_prefix_len(str(ip))
        network=ipaddress.ip_network(str(ip)+'/'+str(prefix),strict=False)
        for n in (int(network.network_address),int(network.broadcast_address),int(network.network_address)-1,int(network.broadcast_address)+1):
            if 0<=n<(1<<ip.max_prefixlen): values.add(str(type(ip)(n)))
    ordered=sorted(values,key=lambda s:(ipaddress.ip_address(s).version,int(ipaddress.ip_address(s))))
    # Retain all explicitly named operational addresses and spread the remainder.
    if len(ordered)>5000:
        remaining=[s for s in ordered if s not in required]
        ordered=sorted(required | set(rng.sample(remaining,5000-len(required))))
    return ordered

def main(report,args):
    import maxminddb
    if maxminddb.__version__!='3.2.0': raise RuntimeError('Pinned reference 3.2.0 is required')
    native=Path(args.native).resolve()
    report['native_executable_sha256']=hashlib.sha256(native.read_bytes()).hexdigest()
    report['js_core_sha256']=hashlib.sha256((ROOT/'dist/core.mjs').read_bytes()).hexdigest()
    sources=json.loads((ROOT/'verification/production-sources.json').read_text(encoding='utf-8'))
    for source in sources:
        file=ROOT/'verification/local/production'/source['file']
        if hashlib.sha256(file.read_bytes()).hexdigest()!=source['sha256']: raise RuntimeError('Production database hash mismatch: '+str(file))
        result={'file':file.name,'bytes':file.stat().st_size,'source_sha256':source['sha256'],'backends':{},'failures':[]}
        with maxminddb.open_database(str(file),maxminddb.MODE_MEMORY) as ref:
            ips=addresses(ref)
            expected=[ref.get_with_prefix_len(ip) for ip in ips]
            meta=ref.metadata()
            expected_meta={key:getattr(meta,key) for key in ('node_count','record_size','ip_version','database_type','binary_format_major_version','binary_format_minor_version','build_epoch','languages','description')}
        result['metadata']=expected_meta
        result['addresses']=len(ips)
        result['families']={str(v):sum(ipaddress.ip_address(ip).version==v for ip in ips) for v in (4,6)}
        result['reference_found']=sum(value is not None for value,_ in expected)
        ipfile=file.with_suffix('.ips.txt');ipfile.write_bytes(('\n'.join(ips)+'\n').encode('utf-8'))
        original=Path.cwd()
        try:
            os.chdir(file.parent)
            with maxminddb.open_database(file.name,maxminddb.MODE_MMAP_EXT) as c:
                for ip,expected_row in zip(ips,expected):
                    if c.get_with_prefix_len(ip)!=expected_row: result['failures'].append({'backend':'C/Python','ip':ip,'reason':'reference disagreement'})
        finally: os.chdir(original)
        for backend,command in [('native',[str(native)]),('js',['node',str(ROOT/'scripts/production-worker.mjs')])]:
            run=subprocess.run([*command,str(file),str(ipfile)],cwd=ROOT,capture_output=True,text=True,encoding='utf-8',timeout=90)
            if run.returncode: raise RuntimeError(backend+' worker failed: '+run.stdout[:2000]+run.stderr[:2000])
            rows=[json.loads(line) for line in run.stdout.splitlines()]
            if len(rows)!=len(ips)+2: raise RuntimeError(backend+' response count mismatch')
            opening,completed=rows[0],rows[-1]
            assert opening['status']=='opened' and all(plain(opening['metadata']).get(k)==v for k,v in expected_meta.items())
            assert completed['status']=='complete' and completed['queries']==len(ips)
            for ip,(value,prefix),row in zip(ips,expected,rows[1:-1]):
                try:
                    assert row['ip']==ip
                    lookup=row['lookup']; projection=row['projection']
                    status='not_found' if value is None else 'found'
                    assert lookup['status']==projection['status']==status
                    assert lookup['prefix_length']==projection['prefix_length']==prefix
                    assert (plain(lookup['record']) if value is not None else lookup['record'])==value
                    assert set(projection['fields'])==set(PATHS)
                    for path in PATHS:
                        selected=select(value,path);field=projection['fields'][path]
                        assert field['status']==('missing' if selected is None else 'present')
                        if selected is not None: assert plain(field['value'])==selected
                except (AssertionError,KeyError,TypeError) as e:
                    result['failures'].append({'backend':backend,'ip':ip,'expected':repr((value,prefix)),'actual':row,'error':str(e)})
            result['backends'][backend]={'queries':len(ips),'record_checks':len(ips),'projection_checks':len(ips),'field_checks':len(ips)*len(PATHS),'metadata_checks':1,'open_ms':opening['open_ms'],'query_loop_elapsed_ms':completed['elapsed_ms'],'measurement_scope':'Two lookups per address (full and projected), typed JSON serialization and output transport; not pure lookup benchmark.'}
        result['failure_count']=len(result['failures']);result['status']='failed' if result['failures'] else 'passed'
        report['databases'].append(result)
        print(json.dumps({k:v for k,v in result.items() if k not in ('failures','metadata')},ensure_ascii=True),flush=True)
    report['failure_count']=sum(r['failure_count'] for r in report['databases'])
    report['status']='failed' if report['failure_count'] else 'passed'

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--native',required=True);args=parser.parse_args()
    report={'started':datetime.datetime.now(datetime.timezone.utc).isoformat(),'status':'running','databases':[],'seed':'0x50524f44','reference':'maxminddb 3.2.0 Python MODE_MEMORY and C MODE_MMAP_EXT','limits':'Deterministic sampled lookup correctness on real DB-IP Lite data. Not verification of real-world geolocation accuracy, every database record, paid GeoIP products or long-running service stability.'}
    OUT.parent.mkdir(parents=True,exist_ok=True);OUT.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    try: main(report,args)
    except Exception as error: report.update(status='failed',error=str(error));raise
    finally:
        report['finished']=datetime.datetime.now(datetime.timezone.utc).isoformat()
        OUT.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    if report['status']!='passed': raise SystemExit(1)
