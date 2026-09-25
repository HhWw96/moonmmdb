import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {environment,workerHarness,load,call,root,out} from './harness.mjs';
const duration=Number(process.env.BROWSER_SOAK_SECONDS||1800);
if(!Number.isFinite(duration)||duration<1)throw new Error('Invalid duration');
const env=await environment(),{page}=env;
const paths=JSON.parse(readFileSync(resolve(root,'verification/production-sources.json'),'utf8')).filter(s=>/city|asn/.test(s.file)).map(s=>'verification/local/production/'+s.file);
const report={status:'running',started:new Date().toISOString(),requested_seconds:duration,browser:env.browser.version(),html_sha256:createHash('sha256').update(readFileSync(resolve(root,'dist/web/index.html'))).digest('hex'),scope:'Isolated Chromium process-tree RSS sum (shared pages may be counted in multiple processes); Windows private bytes when available; no forced GC.',samples:[],cycles:0,reloads:0,max_workers:0,analyses:0,cancellations:0};
const baseline=new Map();
let sampleTimer, samplingError;
try{
 await workerHarness(page);
 const start=performance.now();let nextReload=0,nextValidation=0;
 const sample=()=>{try{const seconds=(performance.now()-start)/1000;const memory=JSON.parse(execFileSync(process.env.PYTHON||'python',[resolve(root,'web/process-memory.py'),String(env.pid)],{encoding:'utf8'}));report.samples.push({seconds,...memory});writeFileSync(resolve(out,'soak-progress.json'),JSON.stringify({seconds,cycles:report.cycles,rss:memory.rss}));}catch(error){samplingError=error;}};
 sample();sampleTimer=setInterval(sample,30000);
 while(performance.now()-start<duration*1000){
  if(samplingError)throw samplingError;
  const seconds=(performance.now()-start)/1000;
  if(seconds>=nextReload){await page.evaluate(()=>window.testReset());const loaded=await load(page,paths);assert.ok(loaded.databases,JSON.stringify(loaded));report.databases=loaded.databases;report.reloads++;nextReload=seconds+120;
   if(report.reloads>1){
     const outcome=await page.evaluate(async()=>{const pending=window.testCall({op:'analyze',options:{file:new File(['{"ip":"8.8.8.8"}\n'.repeat(100000)],'cancel.jsonl'),city:0,asn:1,ipPath:'/ip',top:10,maxBytes:8388608,maxRecords:100000}}).then(()=>false,()=>true);setTimeout(()=>window.testReset(),20);return pending;});
     assert.equal(outcome,true);report.cancellations++;assert.ok((await load(page,paths)).databases);
   }}
  const analysis=await page.evaluate(()=>window.testCall({op:'analyze',options:{file:new File(['{"ip":"8.8.8.8"}\n{"ip":"1.1.1.1"}\n'.repeat(500)],'soak.jsonl'),city:0,asn:1,ipPath:'/ip',top:10,maxBytes:8388608,maxRecords:10000}}));
  assert.ok(analysis.json,JSON.stringify(analysis));if(baseline.has('analysis'))assert.equal(analysis.json,baseline.get('analysis'),'Analysis drift');else baseline.set('analysis',analysis.json);assert.equal(JSON.parse(analysis.json).requests,'1000');report.analyses++;
  const operations=[{op:'lookup',ip:'8.8.8.8'},{op:'compare',ip:'8.8.8.8',fields:['/country/iso_code','/autonomous_system_number']}];
  if(seconds>=nextValidation){operations.push({op:'validate',decode:report.cycles%2===0,work:1_000_000_000,state:64*1024*1024});nextValidation=seconds+60;}
  for(const operation of operations){const reply=await call(page,operation);assert.ok(reply.json,JSON.stringify(reply));const key=JSON.stringify(operation);if(baseline.has(key))assert.equal(reply.json,baseline.get(key),'Result drift');else baseline.set(key,reply.json);assert.notEqual(JSON.parse(reply.json).status,'error');}
  const workers=page.workers().length;report.max_workers=Math.max(report.max_workers,workers);assert.equal(workers,1,'Worker accumulation');
  report.cycles++;await new Promise(r=>setTimeout(r,100));
 }
 if(samplingError)throw samplingError;
 report.elapsed_seconds=(performance.now()-start)/1000;
 const samples=report.samples.filter(s=>s.seconds>=300);assert.ok(samples.length>=20||duration<1800);
 const median=values=>{const v=values.toSorted((a,b)=>a-b);return (v[Math.floor((v.length-1)/2)]+v[Math.floor(v.length/2)])/2;};
 report.gates={};
 if(duration>=1800)for(const metric of ['rss',...(samples.every(s=>s.private!==null)?['private']:[])]){const early=median(samples.slice(0,10).map(s=>s[metric])),late=median(samples.slice(-10).map(s=>s[metric]));const allowed=Math.max(64*1024*1024,early*.25);report.gates[metric]={early_median:early,late_median:late,growth:late-early,allowed};assert.ok(late-early<=allowed,metric+' growth exceeded gate');}
 assert.deepEqual(env.errors,[]);report.status=duration>=1800?'passed':'smoke-only';
}catch(error){report.status='failed';report.error=error.stack;process.exitCode=1;console.error(error);}
finally{clearInterval(sampleTimer);report.finished=new Date().toISOString();writeFileSync(resolve(out,'soak.json'),JSON.stringify(report,null,2)+'\n');await env.close();console.log(JSON.stringify({status:report.status,cycles:report.cycles,seconds:report.elapsed_seconds,gates:report.gates}));}
