"""Actual analyze command, paced input, independent Python aggregate, bounded output."""
import argparse, collections, datetime, hashlib, json, os, shutil, subprocess, sys, threading, time
from pathlib import Path
from process_memory import ProcessMemory, trend
ROOT=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(ROOT/'.reference-deps'))
import maxminddb
p=argparse.ArgumentParser();p.add_argument('--host',choices=['node','native'],required=True);p.add_argument('--seconds',type=int,default=1800);args=p.parse_args()
assert 60<=args.seconds<=3600 and maxminddb.__version__=='3.2.0'
command=[shutil.which('node'),str(ROOT/'bin/moonmmdb.mjs')] if args.host=='node' else [str(ROOT/'dist'/('moonmmdb.exe' if os.name=='nt' else 'moonmmdb'))]
if args.host=='node':assert subprocess.check_output([command[0],'--version'],text=True).strip()=='v24.20.0' and not os.environ.get('NODE_OPTIONS')
paths=[ROOT/f'verification/local/production/dbip-{kind}-lite-2026-09.mmdb' for kind in ('city','asn')]
ips=['1.1.1.1','8.8.8.8','81.2.69.160','2001:4860:4860::8888','2606:4700:4700::1111','::1','10.0.0.1','255.255.255.255','192.0.2.1']
lines=[(json.dumps({'ip':ip})+'\r\n').encode() for ip in ips]+[b'{"ip":"bad"}\n',b'\n']
patterns=[]
for path,field in zip(paths,('country','autonomous_system_number')):
 rows=[]
 with maxminddb.open_database(str(path),maxminddb.MODE_MEMORY) as db:
  for ip in ips:
   record=db.get(ip)
   value=(record.get('country',{}).get('iso_code') if field=='country' else record.get(field)) if record is not None else None
   rows.append(('not_found',None) if record is None else ('missing_field',None) if value is None else ('counted',str(value)))
 patterns.append(rows)
out=ROOT/f'verification/local/analytics-soak-{args.host}.json'
report={'status':'running','formal_gate':args.seconds>=1800,'host':args.host,'platform':os.name,'duration_requested':args.seconds,'rate_cap':100,'samples':[],'databases':[{'file':p.name,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in paths],'scope':'Actual CLI on fixed City+ASN, default runtime, 100 requests/second, independent Python aggregates, no forced GC. Normal EOF is not proof against upstream silent truncation.'}
child=subprocess.Popen([*command,'analyze',*map(str,paths),'-','--max-records','1000000','--max-input-bytes','1073741824'],cwd=ROOT,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
monitor=ProcessMemory(child.pid);start=time.monotonic();stop=threading.Event();errors=[]
state={'sent':0,'stdout':b'','stderr':b'','bytes':0};hash_input=hashlib.sha256()
def drain(name,stream):
 try:
  while chunk:=stream.read(65536):
   state[name]+=chunk
   if len(state[name])>4194304:raise RuntimeError('Unbounded output')
 except Exception as e:errors.append(repr(e));stop.set()
def writer():
 try:
  while time.monotonic()-start<args.seconds and not stop.is_set():
   if stop.wait(max(0,state['sent']/100-(time.monotonic()-start))):break
   if time.monotonic()-start>=args.seconds:break
   raw=b''.join(lines[(state['sent']+i)%len(lines)] for i in range(10))
   child.stdin.write(raw);child.stdin.flush();hash_input.update(raw);state['bytes']+=len(raw);state['sent']+=10
  child.stdin.close()
 except Exception as e:errors.append(repr(e));stop.set()
threads=[threading.Thread(target=drain,args=('stdout',child.stdout),daemon=True),threading.Thread(target=drain,args=('stderr',child.stderr),daemon=True),threading.Thread(target=writer,daemon=True)]
for t in threads:t.start()
try:
 next_sample=0
 while child.poll() is None:
  elapsed=time.monotonic()-start
  if elapsed>=next_sample:
   report['samples'].append({'seconds':elapsed,**monitor.sample()});next_sample+=30
   out.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report['samples'][-1]),flush=True)
  if errors or elapsed>args.seconds+120:raise RuntimeError(repr(errors) or 'CLI did not finish')
  time.sleep(.2)
 for t in threads:t.join(10)
 assert not errors and not any(t.is_alive() for t in threads),errors
 assert child.returncode==2 and not state['stderr'],(child.returncode,state['stderr'])
 result=json.loads(state['stdout']);assert result['status']=='complete'
 n=state['sent'];assert 0<n<=1000000 and result['requests']==str(n)
 valid=sum(n//len(lines)+(i<n%len(lines)) for i in range(len(ips)))
 assert result['valid_ips']==str(valid) and result['invalid_inputs']==str(n-valid)
 assert result['input']=={'bytes':str(state['bytes']),'sha256':hash_input.hexdigest()}
 for name,pattern in zip(('country','asn'),patterns):
  groups=collections.Counter();counts=dict.fromkeys(('counted','not_found','missing_field','type_error','query_error'),0)
  for i,(category,key) in enumerate(pattern):
   count=n//len(lines)+(i<n%len(lines));counts[category]+=count
   if key is not None:groups[key]+=count
  top=sorted(groups.items(),key=lambda x:(-x[1],x[0]))[:10]
  expected={**{k:str(v) for k,v in counts.items()},'group_count':str(len(groups)),'other_requests':str(counts['counted']-sum(v for _,v in top)),'top':[{'key':k,'count':str(v)} for k,v in top]}
  assert result[name]==expected,(name,result[name],expected)
 if args.seconds>=1800:
  report['rss_trend']=trend(report['samples']);assert report['rss_trend']['passed']
  if os.name=='nt':report['private_memory_trend']=trend(report['samples'],'private_bytes');assert report['private_memory_trend']['passed']
 report.update(status='passed' if args.seconds>=1800 else 'diagnostic-passed',requests=n,result=result)
except Exception as e:report.update(status='failed',error=repr(e));raise
finally:
 stop.set();monitor.close()
 if child.poll() is None:child.kill();child.wait()
 report['elapsed_seconds']=time.monotonic()-start;report['finished']=datetime.datetime.now(datetime.timezone.utc).isoformat();out.write_text(json.dumps(report,indent=2)+'\n')
