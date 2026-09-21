"""Verify the Native product against independent Python DB-IP queries."""
import datetime,hashlib,importlib.util,json,subprocess,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(ROOT/'.reference-deps'))
import maxminddb
spec=importlib.util.spec_from_file_location('production',ROOT/'scripts/production-verify.py');helper=importlib.util.module_from_spec(spec);spec.loader.exec_module(helper)
exe=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else ROOT/'dist'/('moonmmdb.exe' if sys.platform=='win32' else 'moonmmdb')
out=ROOT/'verification/local/native-production.json'
report={'status':'running','started':datetime.datetime.now(datetime.timezone.utc).isoformat(),'executable_sha256':hashlib.sha256(exe.read_bytes()).hexdigest(),'reference':'maxminddb 3.2.0 MODE_MEMORY','checks':0,'sources':[]}
try:
 assert maxminddb.__version__=='3.2.0'
 config=json.loads((ROOT/'examples/production-many.json').read_text())
 ips=set()
 for source in config['sources']:
  source['database']=str((ROOT/'examples'/source['database']).resolve())
  source['fields'].append('/absent')
  with maxminddb.open_database(source['database'],maxminddb.MODE_MEMORY) as reader:ips.update(helper.addresses(reader))
 ips=sorted(ips);assert len(ips)>=5000
 cp=out.with_suffix('.config.json');cp.write_text(json.dumps(config),encoding='utf-8')
 text=''.join(json.dumps({'ip':ip})+'\n' for ip in ips)
 run=subprocess.run([str(exe),'enrich-many',str(cp),'-'],input=text,capture_output=True,text=True,encoding='utf-8',timeout=240)
 assert run.returncode in (0,1),run.stderr
 rows=[json.loads(line) for line in run.stdout.splitlines()];assert len(rows)==len(ips)
 summary=json.loads(run.stderr);assert summary['processed']==len(ips) and summary['valid_ips']==len(ips)
 for source in config['sources']:
  counts={'found':0,'not_found':0,'errors':0,'missing_fields':0}
  with maxminddb.open_database(source['database'],maxminddb.MODE_MEMORY) as reader:
   for index,ip in enumerate(ips):
    expected,prefix=reader.get_with_prefix_len(ip);actual=rows[index]['enrichment']['sources'][source['name']]
    assert rows[index]['input']['ip']==ip and rows[index]['line']==index+1
    status='not_found' if expected is None else 'found';counts[status]+=1
    assert actual['status']==status and actual['prefix_length']==prefix,(ip,source['name'])
    for path in source['fields']:
     value=helper.select(expected,path);field=actual['fields'][path]
     assert field['status']==('missing' if value is None else 'present'),(ip,path)
     if value is None:counts['missing_fields']+=1
     else:assert helper.plain(field['value'])==value,(ip,path)
    report['checks']+=1
  observed=summary['sources'][source['name']]
  for key,value in counts.items():assert observed[key]==value
  digest=hashlib.sha256(Path(source['database']).read_bytes()).hexdigest();assert observed['sha256']==digest
  report['sources'].append({'name':source['name'],'addresses':len(ips),'sha256':digest,**counts})
 # The real files individually fit, but City + City + ASN + ASN exceeds 256 MiB.
 aggregate={'version':1,'sources':[{**source,'name':source['name']+str(i)} for source in config['sources'] for i in range(2)]}
 assert sum(Path(s['database']).stat().st_size for s in aggregate['sources'])>268435456
 cp.write_text(json.dumps(aggregate),encoding='utf-8')
 limit=subprocess.run([str(exe),'enrich-many',str(cp),'-'],input='',capture_output=True,text=True,encoding='utf-8',timeout=90)
 assert limit.returncode==2 and limit.stdout=='' and json.loads(limit.stderr)['code']=='file-limit'
 report['aggregate_limit_verified']=True
 report['status']='passed'
except Exception as e:report.update(status='failed',error=str(e));raise
finally:
 report['finished']=datetime.datetime.now(datetime.timezone.utc).isoformat();out.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps(report))
