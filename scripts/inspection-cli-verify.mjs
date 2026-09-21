import {spawn,spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createInterface} from 'node:readline';
import assert from 'node:assert/strict';
import {root} from './moon.mjs';
import {sourceFingerprint,sha256} from './evidence.mjs';
const native=process.argv.includes('--native'),exe=resolve(root,'dist',process.platform==='win32'?'moonmmdb.exe':'moonmmdb');
const binary=native?exe:process.execPath,base=native?[]:[resolve(root,'bin/moonmmdb.mjs')];
const fixture=resolve(root,'verification/local/inspection-stream.mmdb');
const report={status:'running',target:native?'native':'js',platform:process.platform,source_sha256:sourceFingerprint(),artifact_sha256:sha256(readFileSync(native?exe:resolve(root,'dist/core.mjs'))),checks:[]};
const out=resolve(root,`verification/local/inspection-cli-${native?'native':'js'}.json`);
const run=args=>spawnSync(binary,[...base,...args],{cwd:root,encoding:'utf8',timeout:30000,maxBuffer:32*1024*1024,windowsHide:true});
function check(name,fn){fn();report.checks.push(name);}
function normalize(text){return text.trim().split(/\r?\n/).filter(Boolean).map(JSON.parse).map(({message,...rest})=>rest);}
async function stream(name,flags,{slow=false,close=false,code=0,count=131072}={}) {
  const child=spawn(binary,[...base,'networks',fixture,'0.0.0.0/0',...flags],{cwd:root,windowsHide:true});
  let stderr='';child.stderr.setEncoding('utf8');child.stderr.on('data',x=>{stderr+=x;assert(stderr.length<65536);});
  const done=new Promise((res,rej)=>{child.once('error',rej);child.once('close',res);});
  const timer=setTimeout(()=>child.kill(),120000);let received=0;const start=performance.now();
  try {
    for await(const line of createInterface({input:child.stdout,crlfDelay:Infinity})) {
      const value=JSON.parse(line),ip=received*32768;
      const address=[ip>>>24,(ip>>>16)&255,(ip>>>8)&255,ip&255].join('.');
      assert.equal(value.network,address+'/17');assert.deepEqual(value.value,{type:'string',value:'artificial-stream'});
      received++;
      if(close&&received===100){child.stdout.destroy();break;}
      if(slow&&received%1000===0)await new Promise(r=>setTimeout(r,5));
    }
    assert.equal(await done,code,stderr);
    const diagnostics=normalize(stderr);
    if(code===0){assert.equal(received,count);assert.equal(diagnostics[0].records,count);}
    else {assert(!diagnostics.some(x=>x.status==='summary'));assert.equal(diagnostics.at(-1).code,close?'host-output-error':'record-limit');if(!close)assert.equal(received,count);}
    report.checks.push({name,received,seconds:(performance.now()-start)/1000});
  } finally {clearTimeout(timer);if(child.exitCode===null)child.kill();}
}
try {
  for(const [name,args] of [
    ['clipping',['networks','tests/fixtures/MaxMind-DB-test-ipv4-24.mmdb','1.1.1.3/32']],
    ['all structure',['validate','tests/fixtures/MaxMind-DB-test-mixed-28.mmdb']],
    ['decode',['validate','tests/fixtures/GeoIP2-City-Test.mmdb','--decode-data']],
    ['invalid CIDR',['networks',fixture,'1.1.1.1/24']],
    ['work exhaustion',['networks',fixture,'0.0.0.0/0','--max-work','1']],
    ['state exhaustion',['validate',fixture,'--max-state-bytes','1']],
    ['duplicate flag',['validate',fixture,'--max-work','1','--max-work','2']],
    ['unknown flag',['validate',fixture,'--oops']],
    ['metadata resource limit',['validate','tests/fixtures/adversarial/MaxMind-DB-test-metadata-payload-limit.mmdb']],
    ['hidden corruption',['validate','verification/local/inspection-hidden-corruption.mmdb']],
  ])check(name,()=>{
    const actual=run(args);assert(!actual.error,actual.error);
    if(native){const js=spawnSync(process.execPath,[resolve(root,'bin/moonmmdb.mjs'),...args],{cwd:root,encoding:'utf8',timeout:30000});assert.equal(actual.status,js.status);assert.deepEqual(normalize(actual.stdout),normalize(js.stdout));assert.deepEqual(normalize(actual.stderr),normalize(js.stderr));}
    else assert.equal(actual.status,['clipping','all structure','decode'].includes(name)?0:2);
  });
  check('hidden corruption is outside successful lookup',()=>assert.equal(run(['lookup','verification/local/inspection-hidden-corruption.mmdb','1.1.1.1']).status,0));
  await stream('131072 records throughput',['--max-records','131072']);
  await stream('131072 records slow consumer',['--max-records','131072'],{slow:true});
  await stream('record limit is incomplete',[],{code:2,count:100000});
  await stream('early output close',['--max-records','131072'],{close:true,code:2});
  report.status='passed';
} catch(error){report.status='failed';report.error=error.stack;process.exitCode=1;console.error(error);}
writeFileSync(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
