"""Verify a newly packaged module from an isolated local consumer, not a registry."""
import datetime
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import zipfile

ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/'verification/local/package.json'
report={'started':datetime.datetime.now(datetime.timezone.utc).isoformat(),'status':'running','scope':'Fresh local workspace importing a newly extracted moon package, not Mooncakes registry installation.','steps':[]}

def run(args,cwd=ROOT,env=None):
    result=subprocess.run(args,cwd=cwd,env=env,capture_output=True,text=True,encoding='utf-8',errors='replace',timeout=60)
    report['steps'].append({'args':[str(x) for x in args],'exit_code':result.returncode,'output':result.stdout+result.stderr})
    if result.returncode: raise RuntimeError(result.stdout+result.stderr)
    return result.stdout

try:
    config=ROOT/'.local-toolchain.json'
    moon_home=os.environ.get('MOON_HOME') or (json.loads(config.read_text(encoding='utf-8'))['moonHome'] if config.exists() else None)
    moon=str(Path(moon_home)/'bin'/('moon.exe' if os.name=='nt' else 'moon')) if moon_home else shutil.which('moon')
    if not moon: raise RuntimeError('MoonBit toolchain missing')
    env=os.environ.copy()
    if moon_home:
        env['MOON_HOME']=moon_home
        env['PATH']=str(Path(moon_home)/'bin')+os.pathsep+env.get('PATH','')
    run([moon,'package'],env=env)
    archive=max((ROOT/'_build/publish').glob('*.zip'),key=lambda p:p.stat().st_mtime_ns)
    report['archive']=archive.name
    report['sha256']=hashlib.sha256(archive.read_bytes()).hexdigest()
    parent=ROOT/'verification/local'
    parent.mkdir(parents=True,exist_ok=True)
    workspace=Path(tempfile.mkdtemp(prefix='package-consumer-',dir=parent))
    library=workspace/'library'
    library.mkdir()
    with zipfile.ZipFile(archive) as bundle:
        for member in bundle.infolist():
            if not (library/member.filename).resolve().is_relative_to(library.resolve()): raise RuntimeError('Archive path escapes extraction root')
        bundle.extractall(library)
    consumer=workspace/'consumer'
    # The example and its pinned fixture must be present in the archive itself.
    shutil.copytree(library/'examples/log_consumer',consumer,ignore=shutil.ignore_patterns('moon.work','_build','target'))
    (workspace/'moon.work').write_text('members = ["library", "consumer"]\n',encoding='utf-8')
    for target in ('js','wasm-gc'):
        output=run([moon,'test','-p','local/moonmmdb_log_example','--target',target,'--deny-warn'],cwd=workspace,env=env)
        if 'Total tests: 1, passed: 1, failed: 0.' not in output: raise RuntimeError('Consumer test did not execute exactly one expected test')
    report['status']='passed'
except Exception as error:
    report['status']='failed'
    report['error']=str(error)
    raise
finally:
    report['finished']=datetime.datetime.now(datetime.timezone.utc).isoformat()
    OUT.parent.mkdir(parents=True,exist_ok=True)
    OUT.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'status':report['status'],'evidence':str(OUT)},ensure_ascii=True))
