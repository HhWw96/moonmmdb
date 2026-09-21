import {spawn,spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,copyFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {root} from './moon.mjs';
import {sourceFingerprint,sha256} from './evidence.mjs';
const exe=resolve(process.argv[2]||join(root,'dist',process.platform==='win32'?'moonmmdb.exe':'moonmmdb'));
const dir=join(root,'verification/local/native-cli');mkdirSync(dir,{recursive:true});
const report={status:'running',platform:process.platform,source_sha256:sourceFingerprint(),executable_sha256:sha256(readFileSync(exe)),checks:[],started:new Date().toISOString()};
const save=()=>writeFileSync(join(dir,'report.json'),JSON.stringify(report,null,2)+'\n');
const jsonLines=text=>text.trim()?text.trim().split(/\r?\n/).map(JSON.parse):[];
const normalize=value=>{
  if(Array.isArray(value))return value.map(normalize);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>key!=='message').map(([key,v])=>[key,normalize(v)]));
  return value;
};
function execute(args,input,native=true,options={}){
  const r=spawnSync(native?exe:process.execPath,native?args:[join(root,'bin/moonmmdb.mjs'),...args],{cwd:root,input,encoding:'utf8',timeout:30000,maxBuffer:32*1024*1024,windowsHide:true,...options});
  if(r.error)throw r.error;return {code:r.status,stdout:r.stdout,stderr:r.stderr};
}
function check(name,fn){fn();report.checks.push(name);save();}
function parity(name,args,input){check(name,()=>{
  const n=execute(args,input),j=execute(args,input,false);assert.equal(n.code,j.code,name);
  const no=jsonLines(n.stdout),ne=jsonLines(n.stderr),jo=jsonLines(j.stdout),je=jsonLines(j.stderr);
  // Fatal Node diagnostics historically went to stdout; Native routes them to stderr.
  const fatal=o=>o?.status==='error'&&!('line' in o)&&!('ip' in o);
  if(no.length===0&&ne.some(fatal)&&jo.some(fatal)){assert.equal(ne.at(-1).code,jo.at(-1).code);}
  else {assert.deepEqual(normalize(no),normalize(jo),name);assert.deepEqual(normalize(ne),normalize(je),name);}
});}
const config=join(root,'examples/many.json'),asn=join(root,'tests/fixtures/GeoLite2-ASN-Test.mmdb');
const good='{"ip":"192.0.2.1","n":9007199254740993123456789,"negative":-0,"exp":1e100}\n';
try {
check('version and help',()=>{assert.equal(execute(['--version']).stdout.trim(),'0.5.0');assert.equal(execute(['--help']).code,0);assert.equal(execute(['diff']).code,2);});
parity('metadata',['metadata',asn]);parity('lookup mixed',['lookup',asn,'1.128.0.1','1.1.1.1','2001:4860:4860::8888','invalid']);
parity('projection',['project',asn,'1.128.0.1','/autonomous_system_number','/missing']);
parity('invalid pointer',['project',asn,'1.128.0.1','/~2']);
parity('joint hits and misses',['enrich-many',config,'-'],good+'{"ip":"198.51.100.1"}\n{"ip":"1.1.1.1"}\n');
parity('invalid rows',['enrich-many',config,'-'],good+'\n{}\n[]\n{"ip":"bad"}\n{"ip":123}\n');
parity('BOM CRLF and final line',['enrich-many',config,'-'],'\ufeff'+good.trim()+'\r\n{"ip":"192.0.2.2"}');
parity('nested escaped path',['enrich-many',config,'-','--ip-path','/a~1b/0/~0ip'],'{"a/b":[{"~ip":"192.0.2.1"}]}\n');
parity('noncanonical index',['enrich-many',config,'-','--ip-path','/a/00'],'{"a":["192.0.2.1"]}\n');
parity('duplicate JSON key last wins',['enrich-many',config,'-'],'{"ip":"bad","ip":"192.0.2.1"}\n');
check('raw numeric lexemes retained',()=>assert(execute(['enrich-many',config,'-'],good).stdout.includes(good.trim())));
check('SHA256 provenance',()=>{const s=jsonLines(execute(['enrich-many',config,'-'],good).stderr)[0];for(const source of JSON.parse(readFileSync(config)).sources)assert.equal(s.sources[source.name].sha256,createHash('sha256').update(readFileSync(resolve(root,'examples',source.database))).digest('hex'));});
const unicode=join(dir,'中文 路径 😀');mkdirSync(unicode,{recursive:true});copyFileSync(asn,join(unicode,'数据库 😀.mmdb'));
parity('unicode database path',['metadata',join(unicode,'数据库 😀.mmdb')]);
const uc=join(unicode,'配置.json');writeFileSync(uc,JSON.stringify({version:1,sources:[{name:'asn',database:'数据库 😀.mmdb',fields:['/autonomous_system_number']}]}));
parity('relative unicode config',['enrich-many',uc,'-'],'{"ip":"1.128.0.1"}\n');
for(const [name,flags,input,code] of [
 ['record limit',['--max-records','1'],good+good,'record-limit'],
 ['line limit',['--max-line-bytes','3'],good,'line-limit'],
 ['input limit',['--max-input-bytes','3'],good,'input-limit'],
 ['UTF8',[],Buffer.from([0xff,10]),'invalid-utf8'],
])check(name,()=>{const r=execute(['enrich-many',config,'-',...flags],input);assert.equal(r.code,2);const e=jsonLines(r.stderr);assert.equal(e.at(-1).code,code);assert(!e.some(v=>v.status==='summary'));});
for(const [name,flags] of [['duplicate flag',['--max-records','1','--max-records','2']],['leading zero',['--max-records','01']],['option overflow',['--max-records','999999999999999999999']],['unknown flag',['--oops','x']],['field disallowed',['--field','/a']]])parity(name,['enrich-many',config,'-',...flags],good);
check('nesting limit is row error',()=>{const r=execute(['enrich-many',config,'-'],'{"ip":"192.0.2.1","x":'+'['.repeat(130)+'0'+']'.repeat(130)+'}\n'+good);assert.equal(r.code,2);assert.equal(jsonLines(r.stdout)[0].code,'invalid-jsonl');assert.equal(jsonLines(r.stderr)[0].processed,2);});
const bad=join(dir,'bad-config.json');writeFileSync(bad,JSON.stringify({version:1,sources:[{name:'same',database:'missing',fields:['']},{name:'same',database:'missing',fields:['']}]}));
check('invalid config rejected',()=>{const r=execute(['enrich-many',bad,'-'],good);assert.equal(r.code,2);assert.equal(jsonLines(r.stderr)[0].code,'invalid-config');assert.equal(r.stdout,'');});
const broken=join(dir,'broken.mmdb');writeFileSync(broken,'not a database');parity('corrupt database',['metadata',broken]);
const damaged=join(dir,'damaged-tree.mmdb');const altered=Buffer.from(readFileSync(join(root,'tests/scenarios/geo.mmdb')));altered.fill(255,0,6);writeFileSync(damaged,altered);
const four=join(dir,'four.json');const validSource={name:'good',database:join(root,'tests/scenarios/geo.mmdb'),fields:['/country/iso_code','/absent']};
writeFileSync(four,JSON.stringify({version:1,sources:[{...validSource,name:'broken',database:damaged},...['second','third','fourth'].map(name=>({...validSource,name}))]}));
parity('four sources isolate corrupt search path',['enrich-many',four,'-'],good);
const mixed=join(dir,'mixed.json');writeFileSync(mixed,JSON.stringify({version:1,sources:[validSource,{name:'v6',database:join(root,'tests/fixtures/MaxMind-DB-test-ipv6-24.mmdb'),fields:['']}]}));
parity('IPv4 and IPv6 source isolation',['enrich-many',mixed,'-'],'{"ip":"::1:ffff:ffff"}\n');
for(const [name,sources] of [['empty sources',[]],['five sources',['a','b','c','d','e'].map(name=>({...validSource,name}))],['bad name',[{...validSource,name:'1bad'}]],['empty fields',[{...validSource,fields:[]}]],['bad field',[{...validSource,fields:['/~2']}]],['unexpected property',[{...validSource,extra:true}]]]){
 const path=join(dir,'config-case.json');writeFileSync(path,JSON.stringify({version:1,sources}));parity(name,['enrich-many',path,'-'],good);
}
// Confirm preflight returns while stdin is still open and never supplied.
await new Promise((resolvePromise,reject)=>{const child=spawn(exe,['enrich-many',bad,'-'],{cwd:root,windowsHide:true});const timer=setTimeout(()=>{child.kill();reject(new Error('configuration consumed stdin'));},5000);child.stdout.resume();child.stderr.resume();child.on('error',reject);child.on('close',code=>{clearTimeout(timer);try{assert.equal(code,2);resolvePromise();}catch(e){reject(e);}});});report.checks.push('configuration preflight before stdin');
// Test genuine backpressure and an early-closed stdout pipe with bounded writers.
async function stream(closeEarly=false){
  const child=spawn(exe,['enrich-many',config,'-','--max-records','1000000','--max-input-bytes','1073741824'],{cwd:root,windowsHide:true});
  let stderr='',lines=0,buffer='',sent=0;child.stderr.on('data',c=>stderr+=c);child.stdin.on('error',()=>{});
  const timer=setTimeout(()=>child.kill(),120000);
  child.stdout.setEncoding('utf8');child.stdout.on('data',chunk=>{buffer+=chunk;let at;while((at=buffer.indexOf('\n'))>=0){const row=JSON.parse(buffer.slice(0,at));buffer=buffer.slice(at+1);lines++;assert.equal(row.line,lines);if(!closeEarly)assert.equal(row.enrichment.status,'found');}
    if(closeEarly){child.stdout.destroy();}
    else if(lines%1000<100){child.stdout.pause();setTimeout(()=>child.stdout.resume(),5);}
  });
  const block=good.repeat(100);
  function feed(){while(sent<100000){sent+=100;if(!child.stdin.write(block)){child.stdin.once('drain',feed);return;}}child.stdin.end();}feed();
  const code=await new Promise((res,rej)=>{child.on('error',rej);child.on('close',res);});clearTimeout(timer);
  if(closeEarly){assert.equal(code,2);assert(!jsonLines(stderr).some(v=>v.status==='summary'));}
  else {assert.equal(code,0);assert.equal(lines,100000);assert.equal(jsonLines(stderr)[0].processed,100000);}
  return {lines,code};
}
report.stream=await stream();report.checks.push('100000 lines with slow consumer');report.broken_pipe=await stream(true);report.checks.push('early closed stdout');
check('runtime without development tools',()=>{const env={...process.env,PATH:process.platform==='win32'?(process.env.SystemRoot+'\\System32'):'/usr/bin:/bin',MOON_HOME:''};assert.equal(execute(['lookup',asn,'1.128.0.1'],undefined,true,{env}).code,0);});
assert.equal(sourceFingerprint(),report.source_sha256,'Sources changed during Native verification');report.status='passed';
} catch(e){report.status='failed';report.error=e.stack;process.exitCode=1;}finally{report.finished=new Date().toISOString();save();console.log(JSON.stringify({status:report.status,checks:report.checks.length,error:report.error}));}
