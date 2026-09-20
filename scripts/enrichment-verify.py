"""Independently look up each source with Python; compare fields and prefixes."""
import argparse, datetime, hashlib, ipaddress, json, random, subprocess, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(ROOT/'.reference-deps'))
import maxminddb
from importlib.util import spec_from_file_location,module_from_spec
spec=spec_from_file_location('production',ROOT/'scripts/production-verify.py'); helper=module_from_spec(spec);spec.loader.exec_module(helper)
parser=argparse.ArgumentParser();parser.add_argument('--production',action='store_true');parser.add_argument('--native');args=parser.parse_args()
out=ROOT/'verification/local'/('enrichment-production.json' if args.production else 'enrichment.json')
report={'started':datetime.datetime.now(datetime.timezone.utc).isoformat(),'status':'running','reference':'maxminddb 3.2.0 MODE_MEMORY','sources':[],'checks':0,'failure_count':0,'core_sha256':hashlib.sha256((ROOT/'dist/core.mjs').read_bytes()).hexdigest()}
try:
    assert maxminddb.__version__=='3.2.0'
    if args.production:
        sources=[{'name':'geo','database':str(ROOT/'verification/local/production/dbip-city-lite-2026-09.mmdb'),'fields':['/country/iso_code','/city/names/en','/location/latitude','/absent']},{'name':'asn','database':str(ROOT/'verification/local/production/dbip-asn-lite-2026-09.mmdb'),'fields':['/autonomous_system_number','/autonomous_system_organization','/absent']}]
        ips=set()
        for source in sources:
            with maxminddb.open_database(source['database'],maxminddb.MODE_MEMORY) as ref:ips.update(helper.addresses(ref))
        ips=sorted(ips)
    else:
        sources=json.loads((ROOT/'examples/many.json').read_text())['sources']
        for source in sources:source['database']=str((ROOT/'examples'/source['database']).resolve())
        rng=random.Random(0x454e5249)
        ips=[str(ipaddress.IPv4Address(base+i)) for base in (0xc0000200,0xc6336400) for i in range(256)]
        ips+=['0.0.0.0','255.255.255.255','191.255.255.255','192.0.3.0','198.51.99.255','198.51.101.0']
        ips += [str(ipaddress.IPv4Address(rng.getrandbits(32))) for _ in range(512)]
    config=out.with_suffix('.config.json');config.write_text(json.dumps({'version':1,'sources':sources}),encoding='utf-8')
    run=subprocess.run(['node','scripts/enrichment-worker.mjs'],cwd=ROOT,input=json.dumps({'config':str(config),'ips':ips}),text=True,encoding='utf-8',capture_output=True,timeout=180)
    if run.returncode:raise RuntimeError(run.stderr)
    rows=[json.loads(line) for line in run.stdout.splitlines()]
    assert len(rows)==len(ips)
    native_rows=None
    if args.native:
        ipfile=out.with_suffix('.ips.txt');ipfile.write_text('\n'.join(ips)+'\n',encoding='utf-8')
        native=subprocess.run([str(Path(args.native).resolve()),sources[0]['database'],str(ipfile),sources[1]['database']],cwd=ROOT,text=True,encoding='utf-8',capture_output=True,timeout=180)
        assert native.returncode==0,native.stderr
        native_lines=[json.loads(line) for line in native.stdout.splitlines()]
        assert len(native_lines)==len(ips)+2
        native_rows=[line['enrichment'] for line in native_lines[1:-1]]
        report['native_executable_sha256']=hashlib.sha256(Path(args.native).read_bytes()).hexdigest()
    for source in sources:
        with maxminddb.open_database(source['database'],maxminddb.MODE_MEMORY) as ref:
            for ip,row in zip(ips,rows):
                expected,prefix=ref.get_with_prefix_len(ip);actual=row['sources'][source['name']]
                assert actual['prefix_length']==prefix,(ip,source['name'],'prefix')
                assert actual['status']==('not_found' if expected is None else 'found')
                for path in source['fields']:
                    value=helper.select(expected,path);field=actual['fields'][path]
                    assert field['status']==('missing' if value is None else 'present'),(ip,path)
                    if value is not None:assert helper.plain(field['value'])==value,(ip,path)
                report['checks']+=1
                if native_rows is not None:
                    n=native_rows[ips.index(ip)]['sources'][source['name']]
                    assert n['status']==actual['status'] and n['prefix_length']==actual['prefix_length']
                    for path in source['fields']:assert n['fields'][path]==actual['fields'][path],(ip,path,'native')
                    report['native_checks']=report.get('native_checks',0)+1
        report['sources'].append({'name':source['name'],'addresses':len(ips),'sha256':hashlib.sha256(Path(source['database']).read_bytes()).hexdigest()})
    # Validate the analysis consumer separately against independent reference counts.
    from collections import Counter
    log=out.with_suffix('.jsonl');log.write_text(''.join(json.dumps({'ip':ip})+'\n' for ip in ips),encoding='utf-8')
    command=['node','examples/log_analytics/run.mjs',sources[0]['database'],sources[1]['database'],str(log),'--max-records','100000']
    analysis=subprocess.run(command,cwd=ROOT,text=True,encoding='utf-8',capture_output=True,timeout=180)
    assert analysis.returncode in (0,1),analysis.stderr
    summary=json.loads(analysis.stdout);assert summary['requests']==str(len(ips))
    for i,(path,key) in enumerate([('/country/iso_code','country_top10'),('/autonomous_system_number','asn_top10')]):
        counts=Counter()
        with maxminddb.open_database(sources[i]['database'],maxminddb.MODE_MEMORY) as ref:
            for ip in ips:
                value=helper.select(ref.get(ip),path)
                if value is not None:counts[str(value)]+=1
        wanted=[{'key':k,'count':str(n)} for k,n in sorted(counts.items(),key=lambda x:(-x[1],x[0]))[:10]]
        assert summary[key]==wanted,(key,summary[key],wanted)
    report['analysis_checked']=True;report['status']='passed'
except Exception as error:
    report.update(status='failed',failure_count=1,error=str(error));raise
finally:
    report['finished']=datetime.datetime.now(datetime.timezone.utc).isoformat();out.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps(report))
