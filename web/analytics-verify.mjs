import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {expect} from '@playwright/test';
import {environment,workerHarness,load,root,out} from './harness.mjs';
import {VERSION} from '../scripts/version.mjs';
const engine=process.env.BROWSER_ENGINE||'chromium',offline=process.argv.includes('--file');
const env=await environment(engine,offline),{page}=env;
const report={status:'running',browser:env.browser.version(),engine,transport:offline?'file':'http',version:VERSION,html_sha256:createHash('sha256').update(readFileSync(resolve(root,'dist/web/index.html'))).digest('hex'),checks:[]};
async function check(name,fn){await fn();report.checks.push(name);console.log(name);}
async function analyze(raw,options={}) {
  return page.evaluate(async({raw,options})=>window.testCall({op:'analyze',options:{file:new File([Uint8Array.from(raw)],'日志 😀.jsonl'),city:0,asn:1,ipPath:'/ip',top:10,maxBytes:8388608,maxRecords:10000,...options}}),{raw:[...raw],options});
}
function cli(raw,options=[],paths=['tests/scenarios/geo.mmdb','tests/scenarios/asn.mmdb']) {
  const run=spawnSync(process.execPath,['bin/moonmmdb.mjs','analyze',...paths,'-',...options],{cwd:root,input:raw,maxBuffer:16*1024*1024});
  assert.ok([0,1,2].includes(run.status));assert.equal(run.stderr.length,0);return JSON.parse(run.stdout);
}
try {
  await check('sample UI exact totals, role selectors, responsive layout and report download',async()=>{
    await page.getByRole('button',{name:'日志分析样例',exact:true}).click();
    await page.getByRole('button',{name:'开始分析',exact:true}).click();
    await expect(page.locator('.analytics-result')).toBeVisible();
    const actual=JSON.parse(await page.locator('.json').innerText());
    assert.deepEqual(actual,cli(readFileSync(resolve(root,'examples/analysis-access.jsonl'))));
    await expect(page.getByText('分析完成，存在未命中',{exact:true})).toBeVisible();
    const event=page.waitForEvent('download');await page.getByRole('button',{name:'下载 JSON',exact:true}).click();
    const download=await event;const path=resolve(out,`analysis-download-${engine}.json`);await download.saveAs(path);
    const saved=JSON.parse(readFileSync(path));assert.deepEqual(saved.result,actual);assert.equal(saved.operation.options.file.name,'analysis-access.jsonl');
    await page.screenshot({path:resolve(out,`analysis-${engine}-${report.transport}-desktop.png`),fullPage:true});
    await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:resolve(out,`analysis-${engine}-${report.transport}-mobile.png`),fullPage:true});
    await page.setViewportSize({width:1536,height:1024});
    await page.getByRole('button',{name:'清空',exact:true}).click();
  });
  await workerHarness(page);await load(page,['tests/scenarios/geo.mmdb','tests/scenarios/asn.mmdb']);
  await check('empty, BOM CRLF, final line, nested pointer, errors and exact raw hashes',async()=>{
    for(const text of ['', '\uFEFF{"ip":"192.0.2.1"}\r\n\r\nwrong\n{"ip":"bad"}\n{"ip":"2001:db8::1"}', '{"ip":"192.0.2.1","n":18446744073709551615,"s":"中文 😀"}', '{"ip":"198.51.100.1"}\n'.repeat(10)]) {
      const raw=Buffer.from(text),actual=await analyze(raw);assert.deepEqual(JSON.parse(actual.json),cli(raw));
    }
    const raw=Buffer.from('{"client":{"ip":"192.0.2.1"},"padding":"'+'x'.repeat(65488)+'中文😀"}\r\n');
    assert.deepEqual(JSON.parse((await analyze(raw,{ipPath:'/client/ip'})).json),cli(raw,['--ip-path','/client/ip']));
  });
  await check('malformed UTF8, limits, duplicate roles and bad pointer are fatal',async()=>{
    for(const [raw,opts,code] of [[Buffer.from([0xc0,0xaf]),{},'invalid-utf8'],[Buffer.from('{}\n{}'),{maxRecords:1},'record-limit'],[Buffer.from('{}'),{maxBytes:1},'input-limit'],[Buffer.from('{}'),{city:0,asn:0},'browser-database-role'],[Buffer.from('{}'),{top:101},'browser-invalid-limit'],[Buffer.from('{}'),{ipPath:'invalid'},'invalid-path']]) {
      const reply=await analyze(raw,opts);assert.equal(reply.error?.code,code);assert.equal(reply.json,undefined);
    }
    const bad=await page.evaluate(()=>window.testCall({op:'analyze',options:{file:{size:67108865},city:0,asn:1,ipPath:'/ip',top:10,maxBytes:67108864,maxRecords:1000000}}));
    assert.equal(bad.error.code,'input-limit');
  });
  await check('read failure and line/depth boundaries never produce a completed report',async()=>{
    await page.evaluate(()=>window.testReset("const original=Blob.prototype.arrayBuffer;Blob.prototype.arrayBuffer=function(){if(this.size===2)return Promise.reject(new Error('injected I/O'));return original.call(this)};"));
    await load(page,['tests/scenarios/geo.mmdb','tests/scenarios/asn.mmdb']);
    const failed=await analyze(Buffer.from('{}'));assert.equal(failed.error.code,'host-input-error');assert.equal(failed.json,undefined);
    await page.evaluate(()=>window.testReset());await load(page,['tests/scenarios/geo.mmdb','tests/scenarios/asn.mmdb']);
    const tooLong=await page.evaluate(()=>window.testCall({op:'analyze',options:{file:new File([' '.repeat(8388609)],'line-limit.jsonl'),city:0,asn:1,ipPath:'/ip',top:10,maxBytes:16777216,maxRecords:10}}));
    assert.equal(tooLong.error.code,'line-limit');assert.equal(tooLong.json,undefined);
    const deep=Buffer.from('{"ip":"192.0.2.1","nested":'+'['.repeat(129)+'0'+']'.repeat(129)+'}\n');
    const r=JSON.parse((await analyze(deep)).json);assert.equal(r.invalid_inputs,'1');assert.equal(r.exit_code,2);
    assert.deepEqual(r,cli(deep));
  });
  await check('100000 lines and 64 MiB exact boundary stream without retaining records',async()=>{
    const raw=Buffer.from('{"ip":"192.0.2.1"}\n'.repeat(100000));
    const actual=JSON.parse((await analyze(raw,{maxRecords:100000})).json);assert.equal(actual.requests,'100000');assert.equal(actual.country.counted,'100000');assert.equal(actual.input.sha256,createHash('sha256').update(raw).digest('hex'));
    // 128 valid JSON lines of exactly 512 KiB, including LF; no giant host payload transfer.
    const boundary=await page.evaluate(async()=>{
      const prefix='{"ip":"192.0.2.1","pad":"',suffix='"}\n';const line=prefix+' '.repeat(524288-prefix.length-suffix.length)+suffix;
      const file=new File(Array(128).fill(line),'boundary.jsonl');
      return window.testCall({op:'analyze',options:{file,city:0,asn:1,ipPath:'/ip',top:10,maxBytes:67108864,maxRecords:128}});
    });
    const r=JSON.parse(boundary.json);assert.equal(r.input.bytes,'67108864');assert.equal(r.requests,'128');
    const prefix='{"ip":"192.0.2.1","pad":"',suffix='"}\n';const line=prefix+' '.repeat(524288-prefix.length-suffix.length)+suffix;const hash=createHash('sha256');for(let i=0;i<128;i++)hash.update(line);assert.equal(r.input.sha256,hash.digest('hex'));
  });
  if(process.argv.includes('--production'))await check('7114 City + ASN addresses match independent Python and CLI',async()=>{
    const oracle=JSON.parse(readFileSync(resolve(root,'verification/local/browser-oracle.json'))).files.filter(f=>f.mode==='production');
    const city=oracle.find(f=>f.file.includes('city')),asn=oracle.find(f=>f.file.includes('asn'));assert.equal(city.queries.length,7114);assert.equal(asn.queries.length,7114);
    await load(page,[city.file,asn.file]);const raw=Buffer.from(city.queries.map(q=>JSON.stringify({ip:q.ip})+'\n').join(''));
    const actual=JSON.parse((await analyze(raw)).json);assert.deepEqual(actual,cli(raw,[],[city.file,asn.file]));
    for(const [key,entries,pointer] of [['country',city.queries,['country','iso_code']],['asn',asn.queries,['autonomous_system_number']]]) {
      const counts=new Map();let missed=0,missing=0;
      for(const q of entries){if(q.record===null){missed++;continue;}let value=q.record;for(const k of pointer)value=value?.[k];if(value===undefined||value===null){missing++;continue;}const k=typeof value==='object'?value.$integer:value;counts.set(k,(counts.get(k)||0)+1);}
      const top=[...counts].sort((a,b)=>b[1]-a[1]||(a[0]<b[0]?-1:a[0]>b[0]?1:0)).slice(0,10).map(([key,count])=>({key,count:String(count)}));
      assert.deepEqual(actual[key].top,top);assert.equal(actual[key].not_found,String(missed));assert.equal(actual[key].missing_field,String(missing));assert.equal(actual[key].type_error,'0');assert.equal(actual[key].query_error,'0');
    }
    report.production_addresses=7114;report.databases=actual.databases;
  });
  await page.evaluate(()=>{window.testReset();});
  await check('cancel running analysis, reload and retry without stale result',async()=>{
    await page.getByRole('button',{name:'日志分析样例',exact:true}).click();
    await page.getByLabel('选择 JSONL 日志',{exact:true}).setInputFiles({name:'long.jsonl',mimeType:'application/json',buffer:Buffer.from('{"ip":"192.0.2.1"}\n'.repeat(100000))});
    await page.getByText('日志资源限制',{exact:true}).click();await page.getByLabel('最大行数',{exact:true}).fill('100000');
    await page.getByRole('button',{name:'开始分析',exact:true}).click();await page.getByRole('button',{name:'取消操作',exact:true}).click();
    await expect(page.getByRole('alert')).toContainText('操作已取消');await expect(page.locator('.analytics-result')).toHaveCount(0);
    await page.getByRole('button',{name:'重新加载',exact:true}).click();await page.getByRole('button',{name:'开始分析',exact:true}).click();await expect(page.locator('.analytics-result')).toBeVisible({timeout:60000});
    assert.equal(JSON.parse(await page.locator('.json').innerText()).requests,'100000');
  });
  assert.deepEqual(env.errors,[]);assert.ok(env.requests.every(u=>u===env.url||u.startsWith('blob:')||u.startsWith('data:')));
  report.status='passed';
}catch(error){report.status='failed';report.error=error.stack;console.error(error);process.exitCode=1;}
finally{report.requests=env.requests;report.console_errors=env.errors;writeFileSync(resolve(out,`analytics-${engine}-${report.transport}.json`),JSON.stringify(report,null,2)+'\n');await env.close();console.log(JSON.stringify({status:report.status,checks:report.checks.length}));}
