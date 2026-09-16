import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { root, runMoon } from './moon.mjs';
const results=[];
let status='passed';
try {
  for (const target of ['js','wasm-gc']) {
    const output=runMoon(['test','-p','local/moonmmdb_log_example','--target',target,'--deny-warn'],resolve(root,'examples/log_consumer'),true);
    results.push({target,status:'passed',output});
  }
} catch(error) { status='failed'; results.push({status,error:error.message}); }
mkdirSync(resolve(root,'verification/local'),{recursive:true});
writeFileSync(resolve(root,'verification/local/consumer.json'),JSON.stringify({timestamp:new Date().toISOString(),status,scope:'Separate MoonBit module via local workspace dependency; not registry installation.',results},null,2)+'\n');
console.log(JSON.stringify({status,results}));
if (status==='failed') process.exitCode=1;
