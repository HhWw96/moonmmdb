import { spawnSync } from 'node:child_process';
import { mkdirSync,writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { root } from './moon.mjs';
const run = spawnSync(process.execPath,['--max-old-space-size=128','--stack-size=1024','tests/mutation-worker.mjs'],{cwd:root,encoding:'utf8',timeout:45000,maxBuffer:1024*1024});
let report;
try { report=JSON.parse(run.stdout); } catch { report={status:'failed',error:run.error?.message,stderr:run.stderr}; }
report.timestamp=new Date().toISOString();
report.scope='Deterministic truncation/bit-mutation smoke test; not a proof all corrupt inputs are detected.';
mkdirSync(resolve(root,'verification/local'),{recursive:true});
writeFileSync(resolve(root,'verification/local/mutation.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
if (run.status!==0 || report.status!=='passed') process.exitCode=1;
