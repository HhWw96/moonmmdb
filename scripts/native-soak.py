"""Bounded, paced soak of the actual Native JSONL CLI (not the probe)."""
import argparse,ctypes,datetime,hashlib,json,os,statistics,subprocess,threading,time
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
p=argparse.ArgumentParser();p.add_argument('--seconds',type=int,default=1800);p.add_argument('--rate',type=int,default=500);p.add_argument('--exe',default=str(ROOT/'dist'/('moonmmdb.exe' if os.name=='nt' else 'moonmmdb')));args=p.parse_args()
assert args.seconds>=60 and 1<=args.rate<=500 and args.seconds*args.rate<=1000000
exe=Path(args.exe).resolve();config=ROOT/'examples/production-many.json';output=ROOT/'verification/local/native-soak.json'
report={'status':'running','platform':os.name,'started':datetime.datetime.now(datetime.timezone.utc).isoformat(),'duration_requested':args.seconds,'rate_cap':args.rate,'executable_sha256':hashlib.sha256(exe.read_bytes()).hexdigest(),'samples':[],'scope':'Actual Native CLI, paced JSONL input and continuously drained output; not maximum query throughput.'}
ips=['1.1.1.1','8.8.8.8','81.2.69.160','2001:4860:4860::8888','2606:4700:4700::1111','::1','10.0.0.1','255.255.255.255','192.0.2.1']
lines=[json.dumps({'ip':ip},separators=(',',':'))+'\n' for ip in ips]
base=subprocess.run([str(exe),'enrich-many',str(config),'-'],input=''.join(lines),capture_output=True,text=True,encoding='utf-8',timeout=90)
assert base.returncode in (0,1),base.stderr
expected=[json.loads(line)['enrichment'] for line in base.stdout.splitlines()];assert len(expected)==len(ips)
report['sources']=json.loads(base.stderr)['sources']
child=subprocess.Popen([str(exe),'enrich-many',str(config),'-','--max-records','1000000','--max-input-bytes','1073741824'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
errors=[];state={'received':0,'sent':0,'stderr':b''};stop=threading.Event();started=time.monotonic()
def reader():
 try:
  for line in child.stdout:
   value=json.loads(line);i=state['received'];assert value['line']==i+1 and value['input']['ip']==ips[i%len(ips)] and value['enrichment']==expected[i%len(ips)],('result drift',i)
   state['received']+=1
 except Exception as e:errors.append(str(e));stop.set()
def stderr_reader():
 while data:=child.stderr.read(65536):
  state['stderr']+=data
  if len(state['stderr'])>1048576:errors.append('Excessive diagnostics');stop.set();break
def writer():
 try:
  batch=max(1,args.rate//10)
  while not stop.is_set() and time.monotonic()-started<args.seconds:
   remaining=max(0,state['sent']/args.rate-(time.monotonic()-started))
   if stop.wait(remaining):break
   if time.monotonic()-started>=args.seconds:break
   block=''.join(lines[(state['sent']+i)%len(lines)] for i in range(batch))
   child.stdin.write(block.encode());child.stdin.flush();state['sent']+=batch
  child.stdin.close()
 except Exception as e:errors.append(str(e));stop.set()
handle=None
if os.name=='nt':
 from ctypes import wintypes
 class Counters(ctypes.Structure):
  _fields_=[('cb',wintypes.DWORD),('PageFaultCount',wintypes.DWORD)]+[(name,ctypes.c_size_t) for name in ['PeakWorkingSetSize','WorkingSetSize','QuotaPeakPagedPoolUsage','QuotaPagedPoolUsage','QuotaPeakNonPagedPoolUsage','QuotaNonPagedPoolUsage','PagefileUsage','PeakPagefileUsage','PrivateUsage']]
 kernel=ctypes.WinDLL('kernel32',use_last_error=True);psapi=ctypes.WinDLL('psapi',use_last_error=True)
 kernel.OpenProcess.argtypes=[wintypes.DWORD,wintypes.BOOL,wintypes.DWORD];kernel.OpenProcess.restype=wintypes.HANDLE
 kernel.CloseHandle.argtypes=[wintypes.HANDLE];kernel.GetProcessHandleCount.argtypes=[wintypes.HANDLE,ctypes.POINTER(wintypes.DWORD)]
 psapi.GetProcessMemoryInfo.argtypes=[wintypes.HANDLE,ctypes.POINTER(Counters),wintypes.DWORD]
 handle=kernel.OpenProcess(0x410,False,child.pid);assert handle

def sample():
 if os.name=='nt':
  c=Counters();c.cb=ctypes.sizeof(c);assert psapi.GetProcessMemoryInfo(handle,ctypes.byref(c),c.cb)
  h=wintypes.DWORD();assert kernel.GetProcessHandleCount(handle,ctypes.byref(h))
  return {'rss':c.WorkingSetSize,'private_bytes':c.PrivateUsage,'handles':h.value}
 values={}
 for line in Path(f'/proc/{child.pid}/status').read_text().splitlines():
  if ':' in line:
   key,value=line.split(':',1)
   if key in ('VmRSS','RssAnon'):values[key]=int(value.split()[0])*1024
 return {'rss':values['VmRSS'],'private_bytes':values.get('RssAnon',0),'handles':len(list(Path(f'/proc/{child.pid}/fd').iterdir()))}
threads=[threading.Thread(target=f,daemon=True) for f in (reader,stderr_reader,writer)]
for t in threads:t.start()
try:
 next_sample=0
 while child.poll() is None:
  elapsed=time.monotonic()-started
  if elapsed>=next_sample:
   observed=sample();observed.update(seconds=elapsed,received=state['received']);report['samples'].append(observed);next_sample+=30
   output.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
   print(json.dumps(observed),flush=True)
  if stop.is_set() or elapsed>args.seconds+120:raise RuntimeError('Stream failed or did not terminate: '+repr(errors))
  time.sleep(.2)
 for t in threads:t.join(10)
 assert not any(t.is_alive() for t in threads) and not errors,errors
 duration=time.monotonic()-started;assert duration>=args.seconds
 assert child.returncode in (0,1),(child.returncode,state['stderr'])
 assert state['received']==state['sent'] and state['received']>0
 summary=json.loads(state['stderr']);assert summary['status']=='summary' and summary['processed']==state['received']
 report.update(elapsed_seconds=duration,rows=state['received'],rows_per_second=state['received']/duration,peak_rss=max(s['rss'] for s in report['samples']),peak_private_bytes=max(s['private_bytes'] for s in report['samples']),summary=summary)
 if args.seconds>=1800:
  warm=[s for s in report['samples'] if s['seconds']>=300];assert len(warm)>=20
  for key in ('rss','private_bytes'):
   early=statistics.median(s[key] for s in warm[:10]);late=statistics.median(s[key] for s in warm[-10:]);allowed=max(64*1024*1024,early*.25)
   report[key+'_gate']={'early_median':early,'late_median':late,'growth':late-early,'allowed':allowed,'passed':late-early<=allowed}
   assert late-early<=allowed,(key,'memory threshold exceeded')
  first=statistics.median(s['handles'] for s in warm[:10]);last=statistics.median(s['handles'] for s in warm[-10:]);assert last<=first+2,('handles grow',first,last)
  report['status']='passed'
 else:report['status']='smoke-only'
 assert hashlib.sha256(exe.read_bytes()).hexdigest()==report['executable_sha256'],'Executable changed during soak'
except Exception as e:
 report.update(status='failed',error=str(e));stop.set();child.kill();child.wait();raise
finally:
 if handle:kernel.CloseHandle(handle)
 report['finished']=datetime.datetime.now(datetime.timezone.utc).isoformat();output.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps({'status':report['status'],'rows':state['received'],'report':str(output)}),flush=True)
