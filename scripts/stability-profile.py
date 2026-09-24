"""Run identical diagnostics against the two core revisions before default soaks."""
import json, shutil, subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
baseline=ROOT/'verification/local/baseline'
probe=baseline/'examples/allocation_probe';probe.mkdir(parents=True,exist_ok=True)
for name in ('moon.mod','moon.pkg','moon.work','probe.mbt'):
 data=(ROOT/'examples/allocation_probe'/name).read_text(encoding='utf-8')
 if name=='moon.mod':data=data.replace('@0.9.0','@0.8.0')
 (probe/name).write_text(data,encoding='utf-8')
shutil.copyfile(ROOT/'scripts/allocation-profile.mjs',baseline/'scripts/allocation-profile.mjs')
data=baseline/'verification/local/production';data.mkdir(parents=True,exist_ok=True)
for kind in ('city','country'):
 name=f'dbip-{kind}-lite-2026-09.mmdb';shutil.copyfile(ROOT/'verification/local/production'/name,data/name)
out=ROOT/'verification/local/allocation-comparison';out.mkdir(exist_ok=True)
for label,directory in [('before',baseline),('after',ROOT)]:
 run=subprocess.run(['node','scripts/allocation-profile.mjs',label],cwd=directory,capture_output=True,text=True,encoding='utf-8',timeout=180)
 (out/(label+'.log')).write_text(run.stdout+run.stderr,encoding='utf-8')
 assert run.returncode==0,run.stderr
 source=directory/f'verification/local/allocation-{label}.json'
 report=json.loads(source.read_text());assert report['node']=='v24.20.0'
 shutil.copyfile(source,out/(label+'.json'))
# Diagnostic adapters are added to the baseline; no existing reader source is edited.
assert not subprocess.check_output(['git','diff','v0.8.0','--','src','bin'],cwd=baseline,text=True).strip()
