import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { root } from './moon.mjs';
const steps=[
  ['toolchain',['scripts/moon.mjs','version','--all']],
  ['format',['scripts/moon.mjs','fmt','--check']],
  ['api-compat',['scripts/api-compat.mjs']],
  ['js-check',['scripts/moon.mjs','check','--target','js','--deny-warn']],
  ['js-tests',['scripts/moon.mjs','test','--target','js','--deny-warn']],
  ['wasm-check',['scripts/moon.mjs','check','--target','wasm-gc','--deny-warn']],
  ['wasm-tests',['scripts/moon.mjs','test','--target','wasm-gc','--deny-warn']],
  ['build',['scripts/build.mjs']],
  ['cli-tests',['--test','tests/cli.test.mjs','tests/evidence.test.mjs','tests/api.test.mjs','tests/stream.test.mjs','tests/diff.test.mjs','tests/many.test.mjs','tests/api-compat.test.mjs']],
  ['adversarial',['scripts/adversarial-verify.mjs']],
  ['boundary',['scripts/boundary-verify.mjs']],
  ['mutation',['scripts/mutation-verify.mjs']],
  ['consumer',['scripts/consumer-verify.mjs']],
  ['scenarios',['scripts/demo.mjs']],
];
const output=resolve(root,'verification/local');
mkdirSync(output,{recursive:true});
const evidence={started:new Date().toISOString(),platform:process.platform,node:process.version,status:'running',steps:[]};
writeFileSync(resolve(output,'verification.json'),JSON.stringify(evidence,null,2)+'\n');
for (const [name,args] of steps) {
  console.log('Verify: '+name);
  const result=spawnSync(process.execPath,args,{cwd:root,encoding:'utf8',timeout:60000,maxBuffer:16*1024*1024});
  const log=(result.stdout||'')+(result.stderr||'')+(result.error?'\n'+result.error.message:'');
  writeFileSync(resolve(output,name+'.log'),log);
  const passed=result.status===0 && !result.error;
  evidence.steps.push({name,passed,exit_code:result.status,args});
  evidence.status=passed?'running':'failed';
  writeFileSync(resolve(output,'verification.json'),JSON.stringify(evidence,null,2)+'\n');
  if (!passed) { process.stderr.write(log); process.exitCode=1; break; }
}
if (evidence.status==='running') evidence.status='passed';
evidence.finished=new Date().toISOString();
writeFileSync(resolve(output,'verification.json'),JSON.stringify(evidence,null,2)+'\n');
console.log('Verification '+evidence.status+'. Logs: verification/local');
