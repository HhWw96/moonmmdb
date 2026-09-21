"""Independent Python reference for the optional typed consumer's output."""
import argparse,datetime,hashlib,importlib.util,ipaddress,json,os,subprocess,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(ROOT/'.reference-deps'))
import maxminddb
assert maxminddb.__version__=='3.2.0'
parser=argparse.ArgumentParser();parser.add_argument('--production',action='store_true');args=parser.parse_args()
subprocess.run([os.environ.get('NODE','node'),'--input-type=module','-e',"import {runMoon} from './scripts/moon.mjs';runMoon(['build','--target','js','--release','--deny-warn'],'examples/typed_consumer');"],cwd=ROOT,check=True,timeout=60)
spec=importlib.util.spec_from_file_location('production',ROOT/'scripts/production-verify.py');helper=importlib.util.module_from_spec(spec);spec.loader.exec_module(helper)
if args.production:
    sources=json.loads((ROOT/'examples/production-many.json').read_text())['sources']
    inputs=[('city' if s['name']=='geo' else 'asn',(ROOT/'examples'/s['database']).resolve()) for s in sources]
    ips=set()
    for _,file in inputs:
        with maxminddb.open_database(str(file),maxminddb.MODE_MEMORY) as reader:ips.update(helper.addresses(reader))
    production_ips=sorted(ips)
else:
    manifest=json.loads((ROOT/'tests/fixtures/corpus.json').read_text())
    inputs=[('asn' if 'ASN' in e['path'] else 'city',ROOT/'tests/fixtures'/e['path']) for e in manifest['files'] if e['mode']=='reference' and any(word in Path(e['path']).name for word in ['City','Enterprise','ASN'])]

def label(record,locale):
    if record is None:return None
    return {'code':record.get('iso_code'),'name':record.get('names',{}).get(locale),'geoname_id':str(record['geoname_id']) if 'geoname_id' in record else None}

def expected(value,prefix,kind,locale):
    row={'status':'not_found' if value is None else 'found','prefix_length':prefix}
    if value is None:return row
    if kind=='asn':row.update(number=str(value['autonomous_system_number']) if 'autonomous_system_number' in value else None,organization=value.get('autonomous_system_organization'))
    else:
        location=value.get('location',{})
        row.update(country=label(value.get('country'),locale),registered_country=label(value.get('registered_country'),locale),city_name=value.get('city',{}).get('names',{}).get(locale),postal_code=value.get('postal',{}).get('code'),latitude=location.get('latitude'),longitude=location.get('longitude'),time_zone=location.get('time_zone'),subdivisions=[label(s,locale) for s in value.get('subdivisions',[])])
    return row

report={'status':'running','started':datetime.datetime.now(datetime.timezone.utc).isoformat(),'reference':'maxminddb 3.2.0 MODE_MEMORY','production':args.production,'target':'MoonBit JS typed consumer','checks':0,'sources':[]}
try:
    for kind,file in inputs:
        with maxminddb.open_database(str(file),maxminddb.MODE_MEMORY) as reader:
            ips=set(production_ips) if args.production else {'0.0.0.0','1.1.1.1'}
            if not args.production:
                for network,_ in reader:
                    ips.add(str(network.network_address));ips.add(str(network.broadcast_address))
                    assert len(ips)<=8192
            ips=sorted(ips)
            locales=['en'] if args.production else ['en','zh-CN','missing-locale']
            for locale in locales:
                request={'file':str(file),'ips':ips,'kind':kind,'locale':locale}
                run=subprocess.run([os.environ.get('NODE','node'),'scripts/typed-query-driver.mjs'],cwd=ROOT,input=json.dumps(request),capture_output=True,text=True,encoding='utf-8',timeout=90)
                assert run.returncode==0,run.stderr[-1000:]
                rows=json.loads(run.stdout);assert isinstance(rows,list) and len(rows)==len(ips)
                for ip,actual in zip(ips,rows):
                    value,prefix=reader.get_with_prefix_len(ip)
                    want=expected(value,prefix,kind,locale)
                    assert actual==want,(file.name,ip,locale,actual,want)
                    report['checks']+=1
            report['sources'].append({'file':file.name,'sha256':hashlib.sha256(file.read_bytes()).hexdigest(),'addresses':len(ips),'locales':locales})
    report['status']='passed'
except Exception as error:report.update(status='failed',error=str(error)[:3000])
report['finished']=datetime.datetime.now(datetime.timezone.utc).isoformat()
name='typed-production' if args.production else 'typed'
(ROOT/f'verification/local/{name}.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
print(json.dumps(report));sys.exit(0 if report['status']=='passed' else 1)
