"""Independent per-IP reference for the actual Native diff product command."""
import argparse,datetime,hashlib,importlib.util,ipaddress,json,os,random,subprocess,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(ROOT/'.reference-deps'))
import maxminddb
assert maxminddb.__version__=='3.2.0'
p=argparse.ArgumentParser();p.add_argument('--production',action='store_true');args=p.parse_args()
spec=importlib.util.spec_from_file_location('production',ROOT/'scripts/production-verify.py');helper=importlib.util.module_from_spec(spec);spec.loader.exec_module(helper)
exe=ROOT/'dist'/('moonmmdb.exe' if os.name=='nt' else 'moonmmdb')
out=ROOT/'verification/local'/('native-diff-reference'+('-production' if args.production else '')+'.json')
report={'status':'running','started':datetime.datetime.now(datetime.timezone.utc).isoformat(),'executable_sha256':hashlib.sha256(exe.read_bytes()).hexdigest(),'reference':'maxminddb 3.2.0 MODE_MEMORY','production':args.production,'pairs':[],'checks':0,'scope':'Independent lookup and prefix comparison for selected IPs; same-release production snapshots and explicitly artificial changes, not a real monthly update or exhaustive database diff.'}
missing=object()
paths=['','/ip','/country/iso_code','/autonomous_system_number','/site','/missing']
def select(value,path):
 if value is None:return missing
 if path=='':return value
 for token in path[1:].split('/'):
  if not isinstance(value,dict) or token not in value:return missing
  value=value[token]
 return value
try:
 if args.production:
  sources=[s for s in json.loads((ROOT/'verification/production-sources.json').read_text(encoding='utf-8')) if 'city' in s['file'] or 'asn' in s['file']]
  files=[ROOT/'verification/local/production'/s['file'] for s in sources]
  ips=set()
  for f,s in zip(files,sources):
   assert hashlib.sha256(f.read_bytes()).hexdigest()==s['sha256']
   with maxminddb.open_database(str(f),maxminddb.MODE_MEMORY) as db:ips.update(helper.addresses(db))
  ips=sorted(ips);assert len(ips)==7114
  pairs=[(f,f,ips) for f in files]+[(files[0],files[1],ips)]
 else:
  fixture=lambda n:ROOT/'tests/fixtures'/('MaxMind-DB-test-'+n+'.mmdb')
  source=fixture('ipv4-24');data=bytearray(source.read_bytes());offset=data.find(b'1.1.1.2');assert offset>0;data[offset]=ord('9');modified=out.parent/'diff-artificial-update.mmdb';modified.write_bytes(data)
  rng=random.Random(0x44494646)
  v4=[str(ipaddress.IPv4Address(0x01010100+i)) for i in range(256)]+[str(ipaddress.IPv4Address(rng.getrandbits(32))) for _ in range(64)]+['0.0.0.0','255.255.255.255']
  v6=['::','::1','::1:ffff:ffff','::2:0:1','ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff']+[str(ipaddress.IPv6Address(rng.getrandbits(128))) for _ in range(128)]
  pairs=[(source,fixture('ipv4-28'),v4),(source,fixture('ipv4-32'),v4),(source,modified,v4),(source,fixture('ipv6-24'),v4),(fixture('ipv6-24'),fixture('ipv6-28'),v6),(ROOT/'tests/scenarios/tags.mmdb',ROOT/'tests/scenarios/tags-updated.mmdb',['192.0.2.1','198.51.100.1','203.0.113.1','1.1.1.1'])]
 for a,b,ips in pairs:
  run=subprocess.run([str(exe),'diff',str(a),str(b),'-',*[v for path in paths for v in ['--field',path]]],input=''.join(json.dumps({'ip':ip})+'\n' for ip in ips),capture_output=True,text=True,encoding='utf-8',timeout=180)
  assert run.returncode in (0,1),(run.returncode,run.stderr)
  actual=[json.loads(line) for line in run.stdout.splitlines()];assert len(actual)==len(ips)
  changed=0
  with maxminddb.open_database(str(a),maxminddb.MODE_MEMORY) as ra,maxminddb.open_database(str(b),maxminddb.MODE_MEMORY) as rb:
   for i,(ip,row) in enumerate(zip(ips,actual)):
    va,pa=ra.get_with_prefix_len(ip);vb,pb=rb.get_with_prefix_len(ip);d=row['diff'];fields=[p for p in paths if select(va,p)!=select(vb,p)];change=(va is None)!=(vb is None) or pa!=pb or bool(fields);changed+=change
    assert row['line']==i+1 and row['input']['ip']==ip
    assert d['status']==('changed' if change else 'unchanged') and d['record_changed']==((va is None)!=(vb is None)) and d['prefix_changed']==(pa!=pb) and d['changed_fields']==fields,(ip,d)
    for side,v,prefix in [('before',va,pa),('after',vb,pb)]:
     result=d[side];assert result['status']==('not_found' if v is None else 'found') and result['prefix_length']==prefix
     for path in paths:
      wanted=select(v,path);field=result['fields'][path];assert field['status']==('missing' if wanted is missing else 'present')
      if wanted is not missing:assert helper.plain(field['value'])==wanted,(ip,side,path)
    report['checks']+=1
  summary=json.loads(run.stderr);assert summary['processed']==len(ips) and summary['changed']==changed and summary['unchanged']==len(ips)-changed and summary['errors']==0
  assert run.returncode==int(changed>0)
  for side,f in [('before',a),('after',b)]:assert summary['databases'][side]['sha256']==hashlib.sha256(f.read_bytes()).hexdigest()
  report['pairs'].append({'before':a.name,'after':b.name,'addresses':len(ips),'changed':changed,'databases':summary['databases']})
 report['status']='passed'
except Exception as e:report.update(status='failed',error=str(e));raise
finally:
 report['finished']=datetime.datetime.now(datetime.timezone.utc).isoformat();out.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps({k:v for k,v in report.items() if k!='pairs'}))
