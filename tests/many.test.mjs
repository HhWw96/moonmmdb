import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync, spawn} from 'node:child_process';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {once} from 'node:events';
import {root} from '../scripts/moon.mjs';
import {loadMany} from '../bin/many.mjs';
import {open_database, prepare_fields, prepare_enrichment, enrichment_status, enrich_ip} from '../dist/core.mjs';
const fixture=n=>resolve(root,'tests/scenarios',n+'.mmdb');
const run=(args,input)=>spawnSync(process.execPath,['bin/moonmmdb.mjs',...args],{cwd:root,input,encoding:'utf8',timeout:60000,maxBuffer:8388608});
const dir=mkdtempSync(resolve(tmpdir(),'moonmmdb-many-'));
test.after(()=>{
  if(!resolve(dir).startsWith(resolve(tmpdir())+'\\moonmmdb-many-') && !resolve(dir).startsWith(resolve(tmpdir())+'/moonmmdb-many-')) throw new Error('Unexpected cleanup target');
  rmSync(dir,{recursive:true,force:true});
});
function config(sources,name='config.json') {const file=resolve(dir,name);writeFileSync(file,JSON.stringify({version:1,sources}));return file;}
const geo={name:'geo',database:fixture('geo'),fields:['/country/iso_code']};
const asn={name:'asn',database:fixture('asn'),fields:['/autonomous_system_number','/absent']};
test('multiple sources preserve original numbers and produce attributable summary',()=>{
  const result=run(['enrich-many',config([geo,asn]),'-'],'{"ip":"192.0.2.1","id":9007199254740993}\n{"ip":"203.0.113.1"}\n');
  assert.equal(result.status,1,result.stderr);
  assert.match(result.stdout,/9007199254740993/);
  const rows=result.stdout.trim().split('\n').map(JSON.parse);
  assert.equal(rows[0].enrichment.sources.asn.fields['/autonomous_system_number'].value.value,'64512');
  const summary=JSON.parse(result.stderr);
  assert.equal(summary.processed,2);assert.equal(summary.sources.geo.found,1);assert.equal(summary.sources.geo.not_found,1);
  assert.equal(summary.sources.asn.missing_fields,3);assert.match(summary.sources.geo.sha256,/^[0-9a-f]{64}$/);
});
test('configuration and all databases fail before consuming stdin',()=>{
  for(const sources of [[],[geo,geo],[{...geo,name:'1bad'}],[{...geo,fields:['/bad~2']}],[geo,{...asn,database:resolve(dir,'missing')}],[{...geo,unknown:true}]]) {
    const result=run(['enrich-many',config(sources),'-']);assert.equal(result.status,2);assert.doesNotMatch(result.stderr,/"status":"summary"/);
  }
  const empty=run(['enrich-many',config([geo]),'-','--field','/x'],'');assert.equal(empty.status,2);
  assert.throws(()=>loadMany(config([geo,asn]),700),error=>error.code==='file-limit');
  assert.throws(()=>loadMany(config([geo]),268435457),error=>error.code==='invalid-config');
});
test('core bridge rejects mismatches and retains good sources beside errors',()=>{
  const good=open_database(readFileSync(fixture('geo'))), selection=prepare_fields(['/country/iso_code']);
  assert.equal(JSON.parse(enrichment_status(prepare_enrichment(['a'],[],[]))).status,'error');
  const v6=open_database(readFileSync(resolve(root,'tests/fixtures/MaxMind-DB-test-ipv6-24.mmdb')));
  const handle=prepare_enrichment(['geo','v6'],[good,v6],[selection,prepare_fields([''])]);
  const result=JSON.parse(enrich_ip(handle,'::1:ffff:ffff'));
  assert.equal(result.sources.geo.code,'ip-version-mismatch');assert.equal(result.sources.v6.status,'found');
  assert.equal(JSON.parse(enrich_ip(handle,'bad-ip')).code,'invalid-ip');
  assert.equal(JSON.parse(enrichment_status(prepare_enrichment(['a'],[open_database(new Uint8Array(2))],[selection]))).status,'error');
});
test('nested input errors do not hide later successes and truncation has no completion',()=>{
  const cfg=config([geo]);
  const result=run(['enrich-many',cfg,'-','--ip-path','/client/ip'],'bad\n{"client":{"ip":"bad"}}\n{"client":{"ip":"192.0.2.1"}}');
  assert.equal(result.status,2);const summary=JSON.parse(result.stderr);assert.equal(summary.invalid_inputs,2);assert.equal(summary.valid_ips,1);
  const limited=run(['enrich-many',cfg,'-','--max-records','1'],'{"ip":"192.0.2.1"}\n{"ip":"192.0.2.2"}');
  assert.equal(limited.status,2);assert.doesNotMatch(limited.stderr,/"status":"summary"/);
});
test('analytics independent consumer reports correct exact counts',()=>{
  const result=spawnSync(process.execPath,['examples/log_analytics/run.mjs',fixture('geo'),fixture('asn'),'examples/analysis-access.jsonl'],{cwd:root,encoding:'utf8'});
  assert.equal(result.status,1,result.stderr);const s=JSON.parse(result.stdout);assert.equal(s.requests,'4');assert.deepEqual(s.country_top10,[{key:'ZZ',count:'2'},{key:'YY',count:'1'}]);assert.equal(s.asn_top10[0].count,'2');
});
test('100000 rows stream without retaining output and respect slow readers',async()=>{
  const child=spawn(process.execPath,['bin/moonmmdb.mjs','enrich-many',config([geo,asn]),'-','--max-records','100000','--max-input-bytes','67108864'],{cwd:root});
  let lines=0,stderr='';child.stderr.setEncoding('utf8');child.stderr.on('data',s=>stderr+=s);
  const reading=(async()=>{for await(const chunk of child.stdout){for(const b of chunk)if(b===10)lines++;if(lines%5000<100)await new Promise(r=>setTimeout(r,1));}})();
  const completion=once(child,'close');
  const batch='{"ip":"192.0.2.1"}\n'.repeat(1000);
  for(let i=0;i<100;i++)if(!child.stdin.write(batch))await once(child.stdin,'drain');
  child.stdin.end();const [code]=await completion;await reading;
  assert.equal(code,0,stderr);assert.equal(lines,100000);assert.equal(JSON.parse(stderr).processed,100000);
});
test('many output closes early with error and without successful summary',async()=>{
  const child=spawn(process.execPath,['bin/moonmmdb.mjs','enrich-many',config([geo]),'-','--max-records','100000'],{cwd:root});
  let stderr='';child.stderr.on('data',s=>stderr+=s);child.stdin.on('error',()=>{});
  const completion=once(child,'close');child.stdout.once('data',()=>child.stdout.destroy());
  child.stdin.end('{"ip":"192.0.2.1"}\n'.repeat(10000));
  const [code]=await completion;assert.equal(code,2);assert.doesNotMatch(stderr,/"status":"summary"/);
});
