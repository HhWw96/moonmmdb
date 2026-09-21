"""Same-process Native public-API soak; separate from the actual CLI soak."""
import argparse,ctypes,datetime,hashlib,json,os,statistics,subprocess,threading,time
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
p=argparse.ArgumentParser();p.add_argument('--seconds',type=int,default=1800);args=p.parse_args();assert args.seconds>=10
exe=ROOT/'dist'/('inspection-soak.exe' if os.name=='nt' else 'inspection-soak')
sources=json.loads((ROOT/'verification/production-sources.json').read_text())
paths=[ROOT/'verification/local/production'/s['file'] for s in sources if 'city' in s['file'] or 'asn' in s['file']]
for path in paths:assert hashlib.sha256(path.read_bytes()).hexdigest()==next(s['sha256'] for s in sources if s['file']==path.name)
output=ROOT/'verification/local/inspection-soak.json'
report={'status':'running','platform':os.name,'started':datetime.datetime.now(datetime.timezone.utc).isoformat(),'duration_requested':args.seconds,'executable_sha256':hashlib.sha256(exe.read_bytes()).hexdigest(),'scope':'Independent Native consumer, one process, reusable real City/ASN readers, eight cursors including early close plus full ASN referenced-record validation per cycle. Product CLI is tested separately.','sources':[{k:s[k] for k in ('file','sha256')} for s in sources if 'city' in s['file'] or 'asn' in s['file']],'samples':[]}
child=subprocess.Popen([str(exe),*map(str,paths)],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
started=time.monotonic();stop=threading.Event();ack=threading.Event();errors=[];received=0;stderr=bytearray()
def receive():
 global received
 try:
  for line in child.stdout:
   value=json.loads(line)
   assert value=={'status':'tick','checked_nodes':1146501,'decoded_records':81763,'cursors':8},value
   received+=1;ack.set()
 except Exception as e:errors.append(repr(e));stop.set();ack.set()
def diagnostics():
 while data:=child.stderr.read(65536):
  stderr.extend(data)
  if len(stderr)>1048576:errors.append('excessive diagnostics');stop.set();break
def send():
 try:
  while time.monotonic()-started<args.seconds and not stop.is_set():
   ack.clear();child.stdin.write(b'tick\n');child.stdin.flush()
   if not ack.wait(60):raise RuntimeError('Cycle did not complete within 60 seconds')
   stop.wait(.5)
  child.stdin.close()
 except Exception as e:errors.append(repr(e));stop.set()
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
  return {'rss':c.WorkingSetSize,'rss_high_water':c.PeakWorkingSetSize,'private_bytes':c.PrivateUsage,'handles':h.value}
 values={}
 for line in Path(f'/proc/{child.pid}/status').read_text().splitlines():
  if ':' in line:
   key,value=line.split(':',1)
   if key in ('VmRSS','VmHWM','RssAnon'):values[key]=int(value.split()[0])*1024
 return {'rss':values['VmRSS'],'rss_high_water':values['VmHWM'],'private_bytes':values.get('RssAnon',0),'handles':len(list(Path(f'/proc/{child.pid}/fd').iterdir()))}

threads=[threading.Thread(target=f,daemon=True) for f in (receive,diagnostics,send)]
for thread in threads:thread.start()
try:
 next_sample=0
 while child.poll() is None:
  elapsed=time.monotonic()-started
  if elapsed>=next_sample:
   observed=sample();observed.update(seconds=elapsed,cycles=received);report['samples'].append(observed);next_sample+=30
   output.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps(observed),flush=True)
  if stop.is_set() or elapsed>args.seconds+90:raise RuntimeError(repr(errors))
  time.sleep(.2)
 for thread in threads:thread.join(5)
 assert child.returncode==0 and received>0 and not errors and not stderr,(child.returncode,errors,bytes(stderr))
 assert not any(thread.is_alive() for thread in threads)
 report.update(cycles=received,cursors=received*8,elapsed_seconds=time.monotonic()-started,peak_rss=max(s['rss_high_water'] for s in report['samples']))
 assert report['elapsed_seconds']>=args.seconds
 if args.seconds>=1800:
  warm=[s for s in report['samples'] if s['seconds']>=300];assert len(warm)>=20
  for key in ('rss','private_bytes'):
   early=statistics.median(s[key] for s in warm[:10]);late=statistics.median(s[key] for s in warm[-10:]);allowed=max(67108864,early*.25)
   report[key+'_gate']={'early_median':early,'late_median':late,'growth':late-early,'allowed':allowed,'passed':late-early<=allowed};assert late-early<=allowed
  first=statistics.median(s['handles'] for s in warm[:10]);last=statistics.median(s['handles'] for s in warm[-10:]);assert last<=first+2
  report['handles_gate']={'early_median':first,'late_median':last,'passed':True}
  report['status']='passed'
 else:report['status']='smoke-only'
 assert hashlib.sha256(exe.read_bytes()).hexdigest()==report['executable_sha256']
except Exception as e:
 report.update(status='failed',error=str(e));stop.set();child.kill();child.wait();raise
finally:
 if handle:kernel.CloseHandle(handle)
 report['finished']=datetime.datetime.now(datetime.timezone.utc).isoformat();output.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps({'status':report['status'],'cycles':received}),flush=True)
