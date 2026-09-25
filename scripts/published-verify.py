"""Accept only published bytes, then run the native package in an isolated directory."""
import hashlib,json,os,subprocess,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
folder=ROOT/'dist/downloaded'
version=subprocess.check_output(['node','scripts/version.mjs'],cwd=ROOT,text=True).strip()
report={'status':'running','version':version,'platform':sys.platform,'sha256':{}}
try:
 for line in (folder/'SHA256SUMS').read_text().splitlines():
  digest,name=line.split('  ',1)
  assert Path(name).name==name and len(digest)==64
  file=folder/name
  assert file.is_file() and hashlib.sha256(file.read_bytes()).hexdigest()==digest,name
  report['sha256'][name]=digest
 assert f'moonmmdb-{version}-offline.html' in report['sha256']
 platform='windows-x64.zip' if os.name=='nt' else 'linux-x64.tar.gz'
 archive=folder/f'moonmmdb-{version}-{platform}'
 assert archive.name in report['sha256']
 run=subprocess.run([sys.executable,str(ROOT/'scripts/native-package.py'),'--verify',str(archive)],capture_output=True,text=True,encoding='utf-8',timeout=240)
 assert run.returncode==0,run.stdout+run.stderr
 report['native']=json.loads(run.stdout);report['status']='passed'
finally:
 out=ROOT/'verification/local/published.json';out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
