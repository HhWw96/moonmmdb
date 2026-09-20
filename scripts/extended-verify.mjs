// Bind the existing full release suite, Native executable, and real DB corpus.
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {root} from './moon.mjs';
import {sourceFingerprint,sha256} from './evidence.mjs';
const python=process.argv[2] || process.env.PYTHON || 'python';
const directory=resolve(root,'verification/local');mkdirSync(directory,{recursive:true});
const out=resolve(directory,'extended.json');
const executable=resolve(root,'dist/moonmmdb-native-probe.exe');
const report={started:new Date().toISOString(),status:'running',source_sha256:sourceFingerprint(),steps:[]};
const save=()=>writeFileSync(out,JSON.stringify(report,null,2)+'\n');save();
try {
  for(const [name,binary,args] of [
    ['release',process.execPath,['scripts/release-verify.mjs',python]],
    ['native',process.execPath,['scripts/native-verify.mjs']],
    ['native-host',python,['scripts/native-host-verify.py','--native',executable]],
    ['native-fixtures',python,['scripts/native-fixtures.py','--native',executable]],
    ['production',python,['scripts/production-verify.py','--native',executable]],
    ['enrichment-production',python,['scripts/enrichment-verify.py','--production','--native',executable]],
  ]) {
    console.log('Extended verification: '+name);
    const run=spawnSync(binary,args,{cwd:root,encoding:'utf8',timeout:600000,maxBuffer:16*1024*1024});
    const log=(run.stdout||'')+(run.stderr||'')+(run.error?'\n'+run.error.message:'');
    writeFileSync(resolve(directory,'extended-'+name+'.log'),log);
    report.steps.push({name,passed:run.status===0 && !run.error,exit_code:run.status});save();
    if(run.status!==0 || run.error) throw new Error(name+' failed: '+log);
    if(JSON.parse(readFileSync(resolve(directory,name+'.json'),'utf8')).status!=='passed') throw new Error(name+' report did not pass');
  }
  if(sourceFingerprint()!==report.source_sha256) throw new Error('Sources changed during extended verification');
  report.core_sha256=sha256(readFileSync(resolve(root,'dist/core.mjs')));
  report.executable_sha256=sha256(readFileSync(executable));
  const read=name=>JSON.parse(readFileSync(resolve(directory,name+'.json'),'utf8'));
  const release=read('release'),native=read('native'),production=read('production');
  if(release.source_sha256!==report.source_sha256 || native.source_sha256!==report.source_sha256 || release.core_sha256!==report.core_sha256 || production.js_core_sha256!==report.core_sha256) throw new Error('Source or JS evidence binding mismatch');
  if(native.executable_sha256!==report.executable_sha256 || production.native_executable_sha256!==report.executable_sha256 || read('native-fixtures').executable_sha256!==report.executable_sha256 || read('native-host').executable_sha256!==report.executable_sha256) throw new Error('Native executable evidence binding mismatch');
  report.evidence={};
  for(const name of ['release',...Object.keys(release.evidence),'native','native-host','native-fixtures','production','enrichment-production']) {
    const hash=sha256(readFileSync(resolve(directory,name+'.json')));
    if(release.evidence[name] && release.evidence[name]!==hash) throw new Error('Release evidence changed: '+name);
    report.evidence[name]=hash;
  }
  const joined=read('enrichment-production');
  if(joined.core_sha256!==report.core_sha256 || joined.native_executable_sha256!==report.executable_sha256)throw new Error('Production enrichment evidence mismatch');
  report.scope='Pinned Windows x64 MoonBit 0.10.11 + GCC 16.2.0; three real DB-IP Lite September 2026 files plus City/ASN joint lookup and analysis; deterministic sampled correctness, not full database certification or production service SLA.';
  report.status='passed';
} catch(error) {report.status='failed';report.error=error.message;console.error(error.message);process.exitCode=1;}
report.finished=new Date().toISOString();save();
console.log(JSON.stringify({status:report.status,source_sha256:report.source_sha256,executable_sha256:report.executable_sha256}));
