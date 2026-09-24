"""Read only the measured process, without injecting GC or changing its runtime."""
import ctypes, os
from pathlib import Path

class ProcessMemory:
 def __init__(self,pid):
  self.pid=pid;self.handle=None
  if os.name=='nt':
   from ctypes import wintypes
   class Counters(ctypes.Structure):
    _fields_=[('cb',wintypes.DWORD),('PageFaultCount',wintypes.DWORD)]+[(n,ctypes.c_size_t) for n in ['PeakWorkingSetSize','WorkingSetSize','QuotaPeakPagedPoolUsage','QuotaPagedPoolUsage','QuotaPeakNonPagedPoolUsage','QuotaNonPagedPoolUsage','PagefileUsage','PeakPagefileUsage','PrivateUsage']]
   self.Counters=Counters;self.DWORD=wintypes.DWORD
   self.kernel=ctypes.WinDLL('kernel32',use_last_error=True);self.psapi=ctypes.WinDLL('psapi',use_last_error=True)
   self.kernel.OpenProcess.argtypes=[wintypes.DWORD,wintypes.BOOL,wintypes.DWORD];self.kernel.OpenProcess.restype=wintypes.HANDLE
   self.kernel.CloseHandle.argtypes=[wintypes.HANDLE]
   self.kernel.GetProcessHandleCount.argtypes=[wintypes.HANDLE,ctypes.POINTER(wintypes.DWORD)]
   self.psapi.GetProcessMemoryInfo.argtypes=[wintypes.HANDLE,ctypes.POINTER(Counters),wintypes.DWORD]
   self.handle=self.kernel.OpenProcess(0x410,False,pid)
   if not self.handle:raise OSError('Cannot inspect measured process')
 def sample(self):
  if self.handle:
   c=self.Counters();c.cb=ctypes.sizeof(c)
   if not self.psapi.GetProcessMemoryInfo(self.handle,ctypes.byref(c),c.cb):raise OSError('Cannot sample process memory')
   h=self.DWORD()
   if not self.kernel.GetProcessHandleCount(self.handle,ctypes.byref(h)):raise OSError('Cannot sample process handles')
   return {'rss':c.WorkingSetSize,'rss_high_water':c.PeakWorkingSetSize,'private_bytes':c.PrivateUsage,'handles':h.value}
  values={}
  for line in Path(f'/proc/{self.pid}/status').read_text().splitlines():
   key,_,value=line.partition(':')
   if key in ('VmRSS','VmHWM','RssAnon'):values[key]=int(value.split()[0])*1024
  return {'rss':values['VmRSS'],'rss_high_water':values['VmHWM'],'anonymous_rss':values.get('RssAnon',0),'handles':len(list(Path(f'/proc/{self.pid}/fd').iterdir()))}
 def close(self):
  if self.handle:self.kernel.CloseHandle(self.handle);self.handle=None

def trend(samples,key='rss'):
 import statistics
 settled=[s for s in samples if s['seconds']>=300]
 if len(settled)<20:raise ValueError('Insufficient post-warmup samples')
 first=statistics.median(s[key] for s in settled[:10]);last=statistics.median(s[key] for s in settled[-10:])
 limit=max(67108864,first*.25)
 return {'first_median':first,'last_median':last,'growth_bytes':last-first,'allowed_growth_bytes':limit,'passed':last-first<=limit,'peak':max(s[key] for s in samples)}
