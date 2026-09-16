"""Exercise the Windows Unicode file boundary without a compiler on PATH."""
import argparse,datetime,hashlib,json,os,shutil,subprocess,tempfile
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
parser=argparse.ArgumentParser();parser.add_argument('--native',required=True);args=parser.parse_args()
exe=Path(args.native).resolve()
report={'started':datetime.datetime.now(datetime.timezone.utc).isoformat(),'status':'running','executable_sha256':hashlib.sha256(exe.read_bytes()).hexdigest(),'cases':[]}
out=ROOT/'verification/local/native-host.json'
out.parent.mkdir(parents=True,exist_ok=True)
out.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
try:
    directory=Path(tempfile.mkdtemp(prefix='中文 路径 🛰️ ',dir=out.parent))
    copied=directory/'独立 读取器.exe';shutil.copyfile(exe,copied)
    database=directory/'数据库 🛰️ 示例.mmdb'
    shutil.copyfile(ROOT/'tests/fixtures/GeoLite2-ASN-Test.mmdb',database)
    ips=directory/'地址 列表.txt';ips.write_bytes(b'1.0.0.1\r\n1.128.0.1\r\n1.1.1.1\r\n')
    env=os.environ.copy()
    for key in list(env):
        if key.lower()=='path' or key.startswith('MOON'):del env[key]
    env['PATH']=str(Path(os.environ.get('SystemRoot','C:/Windows'))/'System32')
    def run(db,ipfile):
        result=subprocess.run([str(copied),str(db),str(ipfile)],cwd=directory,env=env,capture_output=True,text=True,encoding='utf-8',timeout=10)
        return result,[json.loads(line) for line in result.stdout.splitlines() if line.startswith('{')]
    result,rows=run(database,ips)
    # Fixed artificial fixture values, independently checked with Python 3.2.0.
    passed=(result.returncode==0 and len(rows)==5 and rows[1]['lookup']['record']['value']['autonomous_system_number']['value']=='15169' and rows[2]['lookup']['record']['value']['autonomous_system_number']['value']=='1221' and rows[3]['lookup']['status']=='not_found' and rows[-1]['queries']==3)
    report['cases'].append({'name':'unicode-and-astral-paths-crlf-portable-exe','passed':passed,'exit_code':result.returncode})
    result,rows=run(directory/'不存在.mmdb',ips)
    report['cases'].append({'name':'missing-file','passed':result.returncode==2 and rows[0]['code']=='host-input-error' and rows[0]['io_code']==1,'exit_code':result.returncode})
    oversized=directory/'超过上限.txt'
    with oversized.open('wb') as file:file.truncate(8388609)
    result,rows=run(database,oversized)
    report['cases'].append({'name':'host-size-cap','passed':result.returncode==2 and rows[0]['code']=='host-input-error' and rows[0]['io_code']==3,'exit_code':result.returncode})
    invalid=directory/'编码错误.txt';invalid.write_bytes(b'\xff\xfe')
    result,rows=run(database,invalid)
    report['cases'].append({'name':'invalid-ip-list-encoding','passed':result.returncode==2 and 'invalid UTF8 IP list' in result.stdout,'exit_code':result.returncode})
    report['status']='passed' if all(case['passed'] for case in report['cases']) else 'failed'
    report['scope']='Windows x64 EXE copied to a new Unicode/space/astral path; PATH contains only Windows System32. This is a verification transport, not the Node CLI.'
except Exception as error:report.update(status='failed',error=str(error));raise
finally:
    report['finished']=datetime.datetime.now(datetime.timezone.utc).isoformat()
    out.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(report,ensure_ascii=True))
if report['status']!='passed':raise SystemExit(1)
