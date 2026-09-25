"""Build a bounded Native distribution and run the extracted bytes in isolation."""
import argparse,hashlib,json,os,re,shutil,subprocess,tarfile,tempfile,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
VERSION=re.search(r'^version = "([^"]+)"$', (ROOT/'moon.mod').read_text(), re.M)[1]
parser=argparse.ArgumentParser();parser.add_argument('--verify',type=Path);args=parser.parse_args()
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def verify(archive):
 directory=Path(tempfile.mkdtemp(prefix='moonmmdb-native-'))
 with (zipfile.ZipFile(archive) if archive.suffix=='.zip' else tarfile.open(archive)) as pack:
  names=pack.namelist() if archive.suffix=='.zip' else pack.getnames()
  assert all((directory/name).resolve().is_relative_to(directory.resolve()) for name in names)
  if archive.suffix=='.zip':pack.extractall(directory)
  else:pack.extractall(directory,filter='data')
 folder=next(directory.iterdir());manifest=json.loads((folder/'MANIFEST.json').read_text())
 assert sorted(manifest['files'])==sorted(str(p.relative_to(folder)).replace('\\','/') for p in folder.rglob('*') if p.is_file() and p.name!='MANIFEST.json')
 for name,expected in manifest['files'].items():assert digest(folder/name)==expected,name
 exe=folder/('moonmmdb.exe' if os.name=='nt' else 'moonmmdb')
 env={**os.environ,'PATH':str(Path(os.environ['SystemRoot'])/'System32') if os.name=='nt' else '/nonexistent','MOON_HOME':''}
 for command in [['--version'],['metadata','examples/geo.mmdb'],['lookup','examples/asn.mmdb','192.0.2.1'],['project','examples/asn.mmdb','192.0.2.1','/autonomous_system_number'],['enrich-many','examples/many.json','examples/access.jsonl'],['diff','examples/tags.mmdb','examples/tags-updated.mmdb','examples/access.jsonl','--field','/site'],['networks','examples/asn.mmdb','192.0.2.0/24'],['validate','examples/asn.mmdb','--decode-data']]:
  result=subprocess.run([str(exe),*command],cwd=folder,env=env,capture_output=True,text=True,encoding='utf-8',timeout=20)
  assert result.returncode in (0,1),(command,result.stdout,result.stderr)
  if command==['--version']:assert result.stdout.strip()==VERSION
  else:assert all(isinstance(json.loads(line),dict) for line in result.stdout.splitlines())
  if command[0] in ('enrich-many','diff'):assert json.loads(result.stderr)['status']=='summary'
 result=subprocess.run([str(exe),'analyze','examples/geo.mmdb','examples/asn.mmdb','examples/access.jsonl'],cwd=folder,env=env,capture_output=True,text=True,encoding='utf-8',timeout=20)
 assert result.returncode==1 and not result.stderr
 analytics=json.loads(result.stdout);assert analytics['status']=='complete' and analytics['requests']=='4'
 assert analytics['input']['sha256']==digest(folder/'examples/access.jsonl')
 for command,code in [(['lookup','examples/hidden-corruption.mmdb','1.1.1.1'],0),(['validate','examples/hidden-corruption.mmdb'],2)]:
  result=subprocess.run([str(exe),*command],cwd=folder,env=env,capture_output=True,text=True,encoding='utf-8',timeout=20)
  assert result.returncode==code,(command,result.stdout,result.stderr)
  if code==2:assert json.loads(result.stdout)['code']=='invalid-tree-pointer'
 return {'status':'passed','archive':archive.name,'sha256':digest(archive),'executable_sha256':digest(exe),'without_developer_tools':True,'commands':11}
if args.verify:
 print(json.dumps(verify(args.verify.resolve())));raise SystemExit()
platform='windows-x64' if os.name=='nt' else 'linux-x64';name='moonmmdb-'+VERSION+'-'+platform
exe=ROOT/'dist'/('moonmmdb.exe' if os.name=='nt' else 'moonmmdb')
report={'status':'running','platform':platform,'executable_sha256':digest(exe)}
if os.name=='nt':
 tool=ROOT/'verification/local/toolchains/extracted/w64devkit/bin/objdump.exe'
 output=subprocess.check_output([str(tool),'-p',str(exe)],text=True,encoding='utf-8',errors='replace')
 imports=re.findall(r'DLL Name:\s*(\S+)',output);assert imports
 allowed={'kernel32.dll','msvcrt.dll','advapi32.dll','bcrypt.dll','user32.dll','shell32.dll'}
 assert all(d.lower() in allowed for d in imports),imports
 report['system_dlls']=imports;report['dynamic_system_dll']='shell32.dll (Unicode argv via Windows API)'
else:
 output=subprocess.check_output(['readelf','--version-info',str(exe)],text=True)
 versions=[tuple(map(int,x.split('.'))) for x in re.findall(r'GLIBC_(\d+\.\d+(?:\.\d+)?)',output)]
 assert versions and max(versions)<=(2,35),versions
 report['max_glibc_required']='.'.join(map(str,max(versions)))
 linked=subprocess.check_output(['ldd',str(exe)],text=True);assert 'not found' not in linked
 report['system_libraries']=linked
staging=Path(tempfile.mkdtemp(prefix='moonmmdb-package-'));folder=staging/name;folder.mkdir()
shutil.copy2(exe,folder/exe.name)
if os.name!='nt':(folder/exe.name).chmod(0o755)
for source,target in [('LICENSE','LICENSE'),('THIRD_PARTY.md','THIRD_PARTY.md'),('native_cli/QUICKSTART.md','QUICKSTART.md')]:shutil.copyfile(ROOT/source,folder/target)
shutil.copytree(ROOT/'native_cli/licenses',folder/'licenses')
shutil.copyfile(ROOT/'native_cli/vendor/x/PROVENANCE.json',folder/'licenses/moonbitlang-x-provenance.json')
examples=folder/'examples';examples.mkdir()
for f in ('geo.mmdb','asn.mmdb','tags.mmdb','tags-updated.mmdb','manifest.json'):shutil.copyfile(ROOT/'tests/scenarios'/f,examples/f)
shutil.copyfile(ROOT/'examples/analysis-access.jsonl',examples/'access.jsonl')
shutil.copyfile(ROOT/'verification/local/inspection-hidden-corruption.mmdb',examples/'hidden-corruption.mmdb')
config=json.loads((ROOT/'examples/many.json').read_text())
for source in config['sources']:source['database']=Path(source['database']).name
(examples/'many.json').write_text(json.dumps(config,indent=2)+'\n',encoding='utf-8')
files={str(p.relative_to(folder)).replace('\\','/'):digest(p) for p in sorted(folder.rglob('*')) if p.is_file()}
(folder/'MANIFEST.json').write_text(json.dumps({'version':VERSION,'platform':platform,'files':files,'build':report},indent=2)+'\n',encoding='utf-8')
out=ROOT/'dist/native';out.mkdir(parents=True,exist_ok=True)
archive=out/(name+('.zip' if os.name=='nt' else '.tar.gz'))
if os.name=='nt':
 with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as pack:
  for file in sorted(folder.rglob('*')):
   if file.is_file():pack.write(file,str(file.relative_to(staging)))
else:
 with tarfile.open(archive,'w:gz') as pack:pack.add(folder,arcname=name)
report['archive_verification']=verify(archive);report['status']='passed'
(out/'SHA256SUMS').write_text(f'{digest(archive)}  {archive.name}\n',encoding='utf-8')
(ROOT/'verification/local/native-package.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps(report))
