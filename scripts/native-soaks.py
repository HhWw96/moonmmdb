"""Run the product transport and independent API consumer soaks concurrently.
Each report samples its own child process. Combined load is recorded explicitly.
"""
import subprocess,sys,time
from pathlib import Path
root=Path(__file__).resolve().parent.parent
jobs=[]
try:
 for name in ('native-soak','inspection-soak'):
  log=(root/'verification/local'/f'{name}.log').open('w',encoding='utf-8')
  jobs.append((subprocess.Popen([sys.executable,'-X','utf8',str(root/'scripts'/f'{name}.py')],cwd=root,stdout=log,stderr=subprocess.STDOUT),log))
 started=time.monotonic()
 while any(child.poll() is None for child,_ in jobs):
  if any(child.poll() not in (None,0) for child,_ in jobs):raise RuntimeError('A Native soak failed; inspect individual logs')
  if time.monotonic()-started>1950:raise TimeoutError('Native soaks exceeded deadline')
  time.sleep(1)
 assert all(child.returncode==0 for child,_ in jobs)
 print('Both 30-minute Native soaks passed under concurrent host load.')
finally:
 for child,log in jobs:
  if child.poll() is None:child.terminate();child.wait(timeout=10)
  log.close()
