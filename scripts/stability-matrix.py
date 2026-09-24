"""Same-runner v0.8.0/default-runtime A/B followed by three consecutive candidate runs."""
import argparse, datetime, hashlib, json, os, platform, shutil, subprocess, time
from pathlib import Path
from process_memory import ProcessMemory, trend
ROOT=Path(__file__).resolve().parent.parent
p=argparse.ArgumentParser();p.add_argument('--workload',choices=['country','asn'],required=True);args=p.parse_args()
node=shutil.which('node');assert subprocess.check_output([node,'--version'],text=True).strip()=='v24.20.0'
assert not os.environ.get('NODE_OPTIONS'),'Default Node runtime required'
baseline=ROOT/'verification/local/baseline'
assert subprocess.check_output(['git','describe','--tags','--exact-match'],cwd=baseline,text=True).strip()=='v0.8.0'
out=ROOT/'verification/local'/('stability-'+args.workload);out.mkdir(parents=True,exist_ok=True)
config={'version':1,'sources':[{'name':'geo','database':str(ROOT/'verification/local/production/dbip-city-lite-2026-09.mmdb'),'fields':['/country/iso_code','/city/names/en']},{'name':args.workload,'database':str(ROOT/f'verification/local/production/dbip-{args.workload}-lite-2026-09.mmdb'),'fields':['/country/iso_code'] if args.workload=='country' else ['/autonomous_system_number','/autonomous_system_organization']}]}
cp=out/'config.json';cp.write_text(json.dumps(config))
report={'status':'running','node':'v24.20.0','environment':{'platform':platform.platform(),'processor':platform.processor()},'workload':args.workload,'baseline_tag':'v0.8.0','historical_environment_note':'2026-09-20 Windows/Node24.13.0 failure is retained. This paired comparison fixes Node24.20.0 and runs both revisions sequentially on this same runner; it is not an exact recreation of the old OS/machine/runtime.','runs':[]}
try:
 for name,directory in [('baseline',baseline),('candidate-1',ROOT),('candidate-2',ROOT),('candidate-3',ROOT)]:
  (directory/'verification/local').mkdir(parents=True,exist_ok=True)
  log=out/(name+'.log');dest=out/(name+'.json');samples=[]
  with log.open('wb') as sink:
   child=subprocess.Popen([node,'scripts/soak.mjs',str(cp),'1800','stability-'+name],cwd=directory,stdout=sink,stderr=subprocess.STDOUT)
   monitor=ProcessMemory(child.pid);started=time.monotonic();next_sample=0
   try:
    while child.poll() is None:
     elapsed=time.monotonic()-started
     if elapsed>=next_sample:
      samples.append({'seconds':elapsed,**monitor.sample()});next_sample+=30
     if elapsed>1950:raise TimeoutError('Soak timeout')
     time.sleep(.25)
   finally:
    monitor.close()
    if child.poll() is None:child.kill();child.wait()
  receipt=directory/f'verification/local/stability-{name}.json'
  if not receipt.exists():raise RuntimeError('Soak produced no receipt: '+log.read_text(encoding='utf-8')[-4000:])
  result=json.loads(receipt.read_text())
  assert result['node']=='v24.20.0' and result['exec_argv']==[] and result['gc_mode']=='runtime default'
  assert result['elapsed_seconds']>=1800 and len(result['samples'])>=59
  assert result['status']=='passed' or result.get('error')=='Persistent RSS growth exceeds gate',result
  result['os_samples']=samples;result['os_rss_trend']=trend(samples)
  if os.name=='nt':result['private_memory_trend']=trend(samples,'private_bytes')
  passed=result['status']=='passed' and result['os_rss_trend']['passed'] and result.get('private_memory_trend',{'passed':True})['passed']
  result['combined_gate_passed']=passed;dest.write_text(json.dumps(result,indent=2)+'\n')
  report['runs'].append({'name':name,'passed':passed,'sha256':hashlib.sha256(dest.read_bytes()).hexdigest(),'exit_code':child.returncode})
  print(json.dumps(report['runs'][-1]),flush=True)
  (out/'report.json').write_text(json.dumps(report,indent=2)+'\n')
  if name!='baseline' and not passed:raise RuntimeError('Candidate default-memory gate failed; do not publish')
 report['status']='passed'
except Exception as e:report.update(status='failed',error=repr(e));raise
finally:
 report['finished']=datetime.datetime.now(datetime.timezone.utc).isoformat();(out/'report.json').write_text(json.dumps(report,indent=2)+'\n')
