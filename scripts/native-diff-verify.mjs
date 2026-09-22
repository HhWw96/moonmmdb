import {spawn,spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,copyFileSync,openSync,ftruncateSync,closeSync} from 'node:fs';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {root} from './moon.mjs';
import {sourceFingerprint,sha256} from './evidence.mjs';
const exe=join(root,'dist',process.platform==='win32'?'moonmmdb.exe':'moonmmdb');
const dir=join(root,'verification/local/native-diff');mkdirSync(dir,{recursive:true});
const output=join(root,'verification/local/native-diff.json');
const report={status:'running',platform:process.platform,started:new Date().toISOString(),source_sha256:sourceFingerprint(),executable_sha256:sha256(readFileSync(exe)),checks:[]};
const save=()=>writeFileSync(output,JSON.stringify(report,null,2)+'\n');
const rows=s=>s.trim()?s.trim().split(/\r?\n/).map(JSON.parse):[];
const clean=x=>Array.isArray(x)?x.map(clean):x&&typeof x==='object'?Object.fromEntries(Object.entries(x).filter(([k])=>k!=='message').map(([k,v])=>[k,clean(v)])):x;
const fixture=n=>join(root,'tests/fixtures',n);
const before=fixture('MaxMind-DB-test-ipv4-24.mmdb'),same=fixture('MaxMind-DB-test-ipv4-32.mmdb');
const tags=join(root,'tests/scenarios/tags.mmdb'),updated=join(root,'tests/scenarios/tags-updated.mmdb');
const good='{"ip":"192.0.2.1","id":9007199254740993123,"n":-0,"e":1e100}';
function run(args,input,native=true){const r=spawnSync(native?exe:process.execPath,native?args:[join(root,'bin/moonmmdb.mjs'),...args],{input,encoding:'utf8',timeout:20000,maxBuffer:16*1024*1024,windowsHide:true});if(r.error)throw r.error;return {code:r.status,text:r.stdout,out:rows(r.stdout),err:rows(r.stderr)};}
function check(name,fn){fn();report.checks.push(name);save();}
function parity(name,args,input){check(name,()=>{const n=run(args,input),j=run(args,input,false);assert.equal(n.code,j.code);assert.deepEqual(clean(n.out),clean(j.out));const ns=n.err[0];assert(ns?.status==='summary');const {databases,fields,...counts}=ns;assert.deepEqual(counts,j.err[0]);assert(Array.isArray(fields));for(const [side,path] of [['before',args[1]],['after',args[2]]]){assert.equal(databases[side].sha256,sha256(readFileSync(path)));assert.equal(databases[side].bytes,readFileSync(path).length);}});}
async function preflight(name,args,expected){await new Promise((res,rej)=>{const child=spawn(exe,args,{windowsHide:true});let out='',err='';const timer=setTimeout(()=>{child.kill();rej(new Error(name+' consumed stdin'));},5000);child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err+=b);child.on('error',rej);child.on('close',code=>{clearTimeout(timer);try{assert.equal(code,2);assert.equal(out,'');assert.equal(rows(err)[0].code,expected);assert(!rows(err).some(x=>x.status==='summary'));res();}catch(e){rej(e);}});});report.checks.push(name);save();}
async function stream(early=false){const started=performance.now();const args=['diff',tags,updated,'-','--field','/site','--max-records','100000','--max-input-bytes','1073741824'];const child=spawn(exe,args,{windowsHide:true});let err='',pending='',received=0,sent=0;child.stderr.on('data',b=>err+=b);child.stdin.on('error',()=>{});const timer=setTimeout(()=>child.kill(),120000);const closed=new Promise((res,rej)=>{child.on('error',rej);child.on('close',res);});const block=(good+'\n').repeat(100);
 function feed(){while(sent<100000&&!child.stdin.destroyed){sent+=100;if(!child.stdin.write(block)){child.stdin.once('drain',feed);return;}}if(!child.stdin.destroyed)child.stdin.end();}feed();
 try{for await(const chunk of child.stdout){pending+=chunk.toString('utf8');let at;while((at=pending.indexOf('\n'))>=0){const line=pending.slice(0,at);pending=pending.slice(at+1);const r=JSON.parse(line);assert.equal(r.line,++received);assert.equal(r.diff.status,'changed');assert.deepEqual(r.diff.changed_fields,['/site']);assert(line.includes(good));}if(early){child.stdout.destroy();break;}await new Promise(res=>setTimeout(res,2));}const code=await closed;if(early){assert.equal(code,2);assert(!rows(err).some(x=>x.status==='summary'));assert.equal(rows(err).at(-1).code,'host-output-error');}else{assert.equal(code,1);assert.equal(received,100000);assert.equal(pending,'');assert.equal(rows(err)[0].changed,100000);}return {received,code,seconds:(performance.now()-started)/1000};}finally{clearTimeout(timer);if(child.exitCode===null)child.kill();}}
try{
 parity('equal layouts and misses',['diff',before,same,'-'],'{"ip":"1.1.1.1"}\n{"ip":"255.255.255.255"}\n');
 parity('empty input',['diff',before,same,'-'],'');
 parity('whole record and numeric lexemes',['diff',tags,updated,'-'],good+'\n');
 check('original text retained',()=>assert(run(['diff',tags,updated,'-'],good).text.includes('"input":'+good)));
 parity('selected and absent fields',['diff',tags,updated,'-','--field','/site','--field','/missing'],good+'\n');
 parity('unselected changes ignored',['diff',tags,updated,'-','--field','/missing'],good);
 parity('record presence and prefix changes',['diff',before,fixture('MaxMind-DB-test-ipv6-24.mmdb'),'-','--field','/missing'],'{"ip":"1.1.1.1"}\n');
 parity('IPv6 equal layouts',['diff',fixture('MaxMind-DB-test-ipv6-24.mmdb'),fixture('MaxMind-DB-test-ipv6-28.mmdb'),'-'],'{"ip":"::1:ffff:ffff"}\n{"ip":"2001:db8::1"}\n');
 parity('row errors take precedence',['diff',tags,updated,'-'],good+'\nnot-json\n[]\n{}\n{"ip":"bad"}\n'+good);
 parity('BOM CRLF last line',['diff',tags,updated,'-'],'\ufeff'+good+'\r\n'+good);
 parity('escaped nested IP',['diff',tags,updated,'-','--ip-path','/a~1b/0/~0ip'],'{"a/b":[{"~ip":"192.0.2.1"}]}');
 parity('noncanonical array index',['diff',tags,updated,'-','--ip-path','/a/00'],'{"a":["192.0.2.1"]}');
 parity('duplicate JSON keys',['diff',tags,updated,'-'],'{"ip":"bad","ip":"192.0.2.1"}');
 const unicode=join(dir,'中文 空格 😀');mkdirSync(unicode,{recursive:true});const ub=join(unicode,'旧库.mmdb'),ua=join(unicode,'新库.mmdb'),input=join(unicode,'输入.jsonl');copyFileSync(tags,ub);copyFileSync(updated,ua);writeFileSync(input,good+'\n');parity('Unicode database and input file',['diff',ub,ua,input]);
 for(const [name,flags,data,expected] of [['records',['--max-records','1'],good+'\n'+good,'record-limit'],['line bytes',['--max-line-bytes','3'],good,'line-limit'],['total bytes',['--max-input-bytes','3'],good,'input-limit'],['UTF8',[],Buffer.from([255,10]),'invalid-utf8']])check(name,()=>{const r=run(['diff',tags,updated,'-',...flags],data);assert.equal(r.code,2);assert.equal(r.err.at(-1).code,expected);assert(!r.err.some(x=>x.status==='summary'));});
 parity('exact input limits',['diff',tags,updated,'-','--max-records','1','--max-input-bytes',String(Buffer.byteLength(good)+1),'--max-line-bytes',String(Buffer.byteLength(good))],good+'\n');
 check('depth excess continues as row error',()=>{const r=run(['diff',tags,updated,'-'],'{"ip":"192.0.2.1","x":'+'['.repeat(130)+'0'+']'.repeat(130)+'}\n'+good);assert.equal(r.code,2);assert.equal(r.out[0].code,'invalid-jsonl');assert.equal(r.err[0].processed,2);assert.equal(r.err[0].changed,1);});
 const damaged=join(dir,'damaged.mmdb');const bytes=Buffer.from(readFileSync(tags));bytes.fill(255,0,6);writeFileSync(damaged,bytes);
 for(const side of ['before','after']){const args=['diff',side==='before'?damaged:tags,side==='after'?damaged:updated,'-'];parity('damaged '+side+' query',args,good);check('damaged '+side+' identified',()=>assert(run(args,good).out[0].diff.message.startsWith(side+' database:')));}
 const broken=join(dir,'broken.mmdb');writeFileSync(broken,'not an MMDB');
 for(const side of ['before','after'])await preflight('corrupt '+side+' rejected before stdin',['diff',side==='before'?broken:tags,side==='after'?broken:updated,'-'],'missing-metadata');
 for(const [name,flags,code] of [['bad field',['--field','/~2'],'invalid-path'],['duplicate field',['--field','/site','--field','/site'],'invalid-path'],['bad IP pointer',['--ip-path','/~2'],'invalid-path'],['duplicate flag',['--max-records','1','--max-records','2'],'host-input-error'],['missing value',['--field'],'host-input-error'],['unknown option',['--no','x'],'host-input-error'],['zero limit',['--max-records','0'],'host-input-error'],['leading zero',['--max-records','01'],'host-input-error'],['oversized limit',['--max-records','1000001'],'host-input-error'],['too many fields',Array.from({length:65},(_,i)=>['--field','/'+i]).flat(),'host-input-error']])await preflight(name,['diff',tags,updated,'-',...flags],code);
 const large=join(dir,'oversize.mmdb');const fd=openSync(large,'w');ftruncateSync(fd,268435456);closeSync(fd);await preflight('aggregate file bytes',['diff',tags,large,'-'],'file-limit');const fd2=openSync(large,'r+');ftruncateSync(fd2,268435457);closeSync(fd2);await preflight('single file bytes',['diff',large,tags,'-'],'file-limit');
 report.stream=await stream();report.broken_pipe=await stream(true);report.checks.push('100000 rows with slow consumer','early closed output without completion');
 assert.equal(sourceFingerprint(),report.source_sha256);assert.equal(sha256(readFileSync(exe)),report.executable_sha256);report.status='passed';
}catch(e){report.status='failed';report.error=e.stack;process.exitCode=1;}finally{report.finished=new Date().toISOString();save();console.log(JSON.stringify({status:report.status,checks:report.checks.length,stream:report.stream,error:report.error}));}
