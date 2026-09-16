import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {root} from './moon.mjs';
const output=resolve(root,'verification/local/boundary.json');
mkdirSync(resolve(root,'verification/local'),{recursive:true});
const report={started:new Date().toISOString(),status:'running',results:[]};
writeFileSync(output,JSON.stringify(report,null,2)+'\n');
try {
  const directory=resolve(root,'tests/fixtures/boundary');
  for (const entry of JSON.parse(readFileSync(resolve(directory,'manifest.json'),'utf8'))) {
    const file=resolve(directory,entry.file);
    if (createHash('sha256').update(readFileSync(file)).digest('hex')!==entry.sha256) throw new Error('Hash mismatch: '+entry.file);
    const r=spawnSync(process.execPath,['--max-old-space-size=128','--stack-size=1024','tests/boundary-worker.mjs',file,entry.ip],{cwd:root,encoding:'utf8',timeout:8000,maxBuffer:1024*1024});
    let actual;
    try { actual=JSON.parse(r.stdout); } catch {actual={error:r.error?.message,stderr:r.stderr};}
    let passed=!r.error && r.status===0 && (entry.expected_code ? actual.status==='error' && actual.code===entry.expected_code && actual.projection_code===entry.expected_code : actual.status==='found' && actual.projection_status==='found');
    if(entry.file==='libmaxminddb-uint64-max-epoch.mmdb') passed &&= actual.epoch==='18446744073709551615';
    report.results.push({...entry,passed,actual});
  }
  report.status=report.results.every(r=>r.passed)?'passed':'failed';
} catch(error) {report.status='failed';report.error=error.message;}
report.finished=new Date().toISOString();
report.cases=report.results.length;
report.passed=report.results.filter(r=>r.passed).length;
writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,cases:report.cases,passed:report.passed,error:report.error}));
for(const r of report.results) if(!r.passed) console.error(JSON.stringify(r));
if(report.status!=='passed') process.exitCode=1;
