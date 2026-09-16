"""Run the existing official hostile/boundary corpus through the actual native EXE."""
import argparse,datetime,hashlib,json,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
parser=argparse.ArgumentParser();parser.add_argument('--native',required=True);args=parser.parse_args()
exe=Path(args.native).resolve()
out=ROOT/'verification/local/native-fixtures.json'
report={'started':datetime.datetime.now(datetime.timezone.utc).isoformat(),'status':'running','executable_sha256':hashlib.sha256(exe.read_bytes()).hexdigest(),'results':[],'limits':'8 seconds per process; MoonMMDB default decode limits. No OS RSS cap asserted.'}
out.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
try:
    for group in ('adversarial','boundary'):
        directory=ROOT/'tests/fixtures'/group
        for entry in json.loads((directory/'manifest.json').read_text(encoding='utf-8')):
            file=directory/entry['file']
            if hashlib.sha256(file.read_bytes()).hexdigest()!=entry['sha256']:raise RuntimeError('Fixture hash mismatch')
            ips=ROOT/'verification/local/native-fixture.ips.txt'
            ips.write_bytes((entry.get('ip','1.1.1.1')+'\n').encode('ascii'))
            run=subprocess.run([str(exe),str(file),str(ips)],capture_output=True,text=True,encoding='utf-8',timeout=8)
            rows=[json.loads(line) for line in run.stdout.splitlines()]
            if not rows:raise RuntimeError('No native response: '+run.stderr)
            if rows[0]['status']=='error':lookup=projection=rows[0]
            else:lookup,projection=rows[1]['lookup'],rows[1]['projection']
            expected=entry['expected_code']
            passed=run.returncode in (0,2) and (lookup.get('code')==projection.get('code')==expected and lookup['status']=='error' if expected else lookup['status']==projection['status']=='found')
            if entry['file']=='libmaxminddb-uint64-max-epoch.mmdb':passed=passed and rows[0]['metadata']['value']['build_epoch']['value']=='18446744073709551615'
            report['results'].append({'file':entry['file'],'group':group,'passed':passed,'expected_code':expected,'actual_status':lookup['status'],'actual_code':lookup.get('code'),'exit_code':run.returncode})
    report['cases']=len(report['results']);report['passed']=sum(r['passed'] for r in report['results']);report['status']='passed' if report['passed']==report['cases'] else 'failed'
except Exception as error:report.update(status='failed',error=str(error));raise
finally:
    report['finished']=datetime.datetime.now(datetime.timezone.utc).isoformat();out.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({k:v for k,v in report.items() if k!='results'}))
if report['status']!='passed':raise SystemExit(1)
