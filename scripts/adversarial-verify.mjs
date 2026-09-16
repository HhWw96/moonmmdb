import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { root } from './moon.mjs';
const directory = resolve(root,'tests/fixtures/adversarial');
const cases = JSON.parse(readFileSync(resolve(directory,'manifest.json'),'utf8'));
const results = [];
for (const entry of cases) {
  const file = resolve(directory,entry.file);
  if (createHash('sha256').update(readFileSync(file)).digest('hex') !== entry.sha256) throw new Error('Fixture hash mismatch: ' + entry.file);
  const start = performance.now();
  const run = spawnSync(process.execPath,['--max-old-space-size=128','--stack-size=1024',resolve(root,'tests/adversarial-worker.mjs'),file],{cwd:root,encoding:'utf8',timeout:8000,maxBuffer:2*1024*1024});
  let actual;
  try { actual = JSON.parse(run.stdout); } catch { actual = {error:run.error?.message,stderr:run.stderr,status:run.status}; }
  const passed = run.status === 0 && actual.status === 'error' && actual.code === entry.expected_code;
  results.push({...entry,passed,elapsed_ms:performance.now()-start,actual});
}
const report = {timestamp:new Date().toISOString(),status:results.every(r=>r.passed)?'passed':'failed',limits:{per_process_timeout_ms:8000,v8_old_space_mib:128,note:'V8 old-space cap, not a total process RSS cap; MoonBit also bounds decode work and payload.'},cases:results.length,passed:results.filter(r=>r.passed).length,results};
mkdirSync(resolve(root,'verification/local'),{recursive:true});
writeFileSync(resolve(root,'verification/local/adversarial.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,cases:report.cases,passed:report.passed}));
for (const row of results) if (!row.passed) console.error(JSON.stringify(row));
if (report.status === 'failed') process.exitCode = 1;
