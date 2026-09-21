import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { root, runMoon } from './moon.mjs';
const results=[];
let status='passed';
try {
  for (const target of ['js','wasm-gc']) {
    runMoon(['fmt','--check'],resolve(root,'examples/typed_consumer'),true);
    const typed=runMoon(['test','-p','local/moonmmdb_typed_example','--target',target,'--deny-warn'],resolve(root,'examples/typed_consumer'),true);
    if(!typed.includes('Total tests: 1, passed: 1, failed: 0.'))throw new Error('Typed consumer did not run');
    results.push({target,consumer:'typed',status:'passed',output:typed});
    const output=runMoon(['test','-p','local/moonmmdb_log_example','--target',target,'--deny-warn'],resolve(root,'examples/log_consumer'),true);
    if (!output.includes('Total tests: 1, passed: 1, failed: 0.')) throw new Error('Expected consumer test did not execute: '+output);
    results.push({target,status:'passed',output});
    const analysis=runMoon(['test','-p','local/moonmmdb_log_analytics','--target',target,'--deny-warn'],resolve(root,'examples/log_analytics'),true);
    if(!analysis.includes('Total tests: 4, passed: 4, failed: 0.')) throw new Error('Expected analytics tests did not run: '+analysis);
    results.push({target,consumer:'analytics',status:'passed',output:analysis});
  }
} catch(error) { status='failed'; results.push({status,error:error.message}); }
mkdirSync(resolve(root,'verification/local'),{recursive:true});
writeFileSync(resolve(root,'verification/local/consumer.json'),JSON.stringify({timestamp:new Date().toISOString(),status,scope:'Separate MoonBit module via local workspace dependency; not registry installation.',results},null,2)+'\n');
console.log(JSON.stringify({status,results}));
if (status==='failed') process.exitCode=1;
