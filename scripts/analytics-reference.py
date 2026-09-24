"""Aggregate independent Python lookups, never using MoonMMDB as the expected answer."""
import argparse, collections, datetime, hashlib, importlib.util, json, os, subprocess, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(ROOT/'.reference-deps'))
import maxminddb
p=argparse.ArgumentParser();p.add_argument('--production',action='store_true');p.add_argument('--native',action='store_true');args=p.parse_args()
spec=importlib.util.spec_from_file_location('production',ROOT/'scripts/production-verify.py');helper=importlib.util.module_from_spec(spec);spec.loader.exec_module(helper)
assert maxminddb.__version__=='3.2.0'
paths=[ROOT/'tests/scenarios'/f for f in ('geo.mmdb','asn.mmdb')]
ips=['192.0.2.1','198.51.100.1','192.0.2.1','203.0.113.1']
if args.production:
 paths=[ROOT/'verification/local/production'/f'dbip-{kind}-lite-2026-09.mmdb' for kind in ('city','asn')]
 sources=json.loads((ROOT/'verification/production-sources.json').read_text())
 for path in paths:assert hashlib.sha256(path.read_bytes()).hexdigest()==next(s['sha256'] for s in sources if s['file']==path.name)
 values=set()
 for path in paths:
  with maxminddb.open_database(str(path),maxminddb.MODE_MEMORY) as reader:values.update(helper.addresses(reader))
 ips=sorted(values);assert len(ips)==7114
raw=(''.join(json.dumps({'client':{'ip':ip}})+'\r\n' for ip in ips)).encode()
expected={}
for name,path,pointer in zip(('country','asn'),paths,('/country/iso_code','/autonomous_system_number')):
 counts=collections.Counter();buckets=dict.fromkeys(('counted','not_found','missing_field','type_error','query_error'),0)
 with maxminddb.open_database(str(path),maxminddb.MODE_MEMORY) as ref:
  for ip in ips:
   value=ref.get(ip)
   if value is None:buckets['not_found']+=1;continue
   field=helper.select(value,pointer)
   if field is None:buckets['missing_field']+=1;continue
   valid=isinstance(field,str) if name=='country' else isinstance(field,int) and not isinstance(field,bool) and field>=0
   if not valid:buckets['type_error']+=1;continue
   buckets['counted']+=1;counts[str(field)]+=1
 rows=sorted(counts.items(),key=lambda row:(-row[1],row[0]))[:10]
 expected[name]={**{k:str(v) for k,v in buckets.items()},'group_count':str(len(counts)),'other_requests':str(buckets['counted']-sum(n for _,n in rows)),'top':[{'key':k,'count':str(n)} for k,n in rows]}
report={'status':'running','reference':'maxminddb 3.2.0 MODE_MEMORY, independent Python Counter aggregation','addresses_per_database':len(ips),'input_sha256':hashlib.sha256(raw).hexdigest(),'databases':[{'file':p.name,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in paths],'hosts':[]}
out=ROOT/'verification/local'/('analytics-production.json' if args.production else 'analytics-reference.json')
try:
 hosts=[['node','bin/moonmmdb.mjs']]
 if args.native:hosts.append([str(ROOT/'dist'/('moonmmdb.exe' if os.name=='nt' else 'moonmmdb'))])
 for command in hosts:
  run=subprocess.run([*command,'analyze',*map(str,paths),'-','--ip-path','/client/ip'],input=raw,capture_output=True,cwd=ROOT,timeout=180)
  assert run.returncode in (0,1),(run.returncode,run.stderr)
  actual=json.loads(run.stdout);assert not run.stderr
  assert actual['country']==expected['country'] and actual['asn']==expected['asn'],actual
  assert actual['requests']==actual['valid_ips']==str(len(ips)) and actual['invalid_inputs']=='0'
  assert actual['input']=={'bytes':str(len(raw)),'sha256':report['input_sha256']}
  for name,path in zip(('city','asn'),paths):assert actual['databases'][name]['sha256']==hashlib.sha256(path.read_bytes()).hexdigest()
  report['hosts'].append({'command':command,'exit_code':run.returncode,'report_sha256':hashlib.sha256(run.stdout).hexdigest()})
 report['status']='passed'
except Exception as error:report.update(status='failed',error=repr(error));raise
finally:
 report['finished']=datetime.datetime.now(datetime.timezone.utc).isoformat();out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
