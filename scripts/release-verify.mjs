// A single fresh verification run binds all evidence to the same source and core.
import {spawnSync} from 'node:child_process';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {root} from './moon.mjs';
import {sourceFingerprint,sha256} from './evidence.mjs';
const python=process.argv[2] || process.env.PYTHON || 'python';
const output=resolve(root,'verification/local/release.json');
mkdirSync(resolve(root,'verification/local'),{recursive:true});
const report={started:new Date().toISOString(),status:'running',source_sha256:sourceFingerprint(),steps:[]};
const save=()=>writeFileSync(output,JSON.stringify(report,null,2)+'\n');
save();
try {
  for(const [name,binary,args] of [
    ['verification',process.execPath,['scripts/verify.mjs']],
    ['reference',python,['scripts/reference-verify.py']],
    ['corpus',python,['scripts/corpus-verify.py']],
    ['typed',python,['scripts/typed-verify.py']],
    ['inspection-js',python,['scripts/inspection-verify.py']],
    ['comparison',python,['scripts/comparison-verify.py']],
    ['enrichment',python,['scripts/enrichment-verify.py']],
    ['scale',python,['scripts/scale-verify.py']],
    ['package',python,['scripts/package-verify.py']],
    ['benchmark',process.execPath,['scripts/benchmark.mjs']],
  ]) {
    console.log('Release check: '+name);
    const run=spawnSync(binary,args,{cwd:root,encoding:'utf8',timeout:180000,maxBuffer:16*1024*1024});
    const log=(run.stdout||'')+(run.stderr||'')+(run.error?'\n'+run.error.message:'');
    writeFileSync(resolve(root,'verification/local/release-'+name+'.log'),log);
    report.steps.push({name,passed:run.status===0 && !run.error,exit_code:run.status});
    save();
    if(run.status!==0 || run.error) throw new Error(name+' failed: '+log);
    const evidence=JSON.parse(readFileSync(resolve(root,'verification/local/'+name+'.json'),'utf8'));
    if(name==='reference' ? evidence.failure_count!==0 || !['passed','passed-with-reference-disagreement'].includes(evidence.status) : name!=='benchmark' && evidence.status!=='passed') throw new Error(name+' evidence did not pass');
  }
  if(sourceFingerprint()!==report.source_sha256) throw new Error('Sources changed during verification; rerun required');
  report.core_sha256=sha256(readFileSync(resolve(root,'dist/core.mjs')));
  report.evidence={};
  for(const name of ['verification','api-compat','reference','corpus','typed','inspection-js','comparison','enrichment','adversarial','boundary','mutation','consumer','scale','package','benchmark']) {
    report.evidence[name]=sha256(readFileSync(resolve(root,'verification/local/'+name+'.json')));
  }
  report.status='passed';
} catch(error) {report.status='failed';report.error=error.message;console.error(error.message);process.exitCode=1;}
report.finished=new Date().toISOString();
save();
console.log(JSON.stringify({status:report.status,source_sha256:report.source_sha256,core_sha256:report.core_sha256}));
