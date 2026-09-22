import {expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {environment,workerHarness,load,call,root,out} from './harness.mjs';
const engine=process.env.BROWSER_ENGINE||'chromium', file=process.argv.includes('--file');
const report={status:'running',engine,transport:file?'file-offline':'http',started:new Date().toISOString(),files:[],queries:0,checks:[],html_sha256:createHash('sha256').update(readFileSync(resolve(root,'dist/web/index.html'))).digest('hex')};
const env=await environment(engine,file),{page}=env;
report.browser=env.browser.version();
async function check(name,fn){await fn();report.checks.push(name);}
async function result(){await expect(page.locator('.json')).toBeVisible();return JSON.parse(await page.locator('.json').textContent());}
try {
 await check('initial screen, title and disabled controls',async()=>{assert.match(await page.title(),/MoonMMDB/);await expect(page.getByRole('button',{name:'查询',exact:true})).toBeDisabled();await page.screenshot({path:resolve(out,`${engine}-${report.transport}-desktop.png`)});});
 await check('offline ASN fixture and exact integer',async()=>{await page.getByRole('button',{name:'ASN 查询样例'}).click();await page.getByRole('button',{name:'查询',exact:true}).click();assert.equal((await result()).fields['/autonomous_system_number'].value.value,'64512');});
 await check('missing field distinct from missing IP',async()=>{await page.getByLabel('提取字段（可选）').fill('/missing');await page.getByRole('button',{name:'查询',exact:true}).click();assert.equal((await result()).fields['/missing'].status,'missing');await page.getByLabel('IP 地址',{exact:true}).fill('203.0.113.1');await page.getByRole('button',{name:'查询',exact:true}).click();assert.equal((await result()).status,'not_found');});
 await check('invalid IP and invalid pointer',async()=>{await page.getByLabel('IP 地址',{exact:true}).fill('not-an-ip');await page.getByRole('button',{name:'查询',exact:true}).click();assert.equal((await result()).status,'error');await page.getByLabel('IP 地址',{exact:true}).fill('192.0.2.1');await page.getByLabel('提取字段（可选）').fill('invalid');await page.getByRole('button',{name:'查询',exact:true}).click();assert.equal((await result()).status,'error');});
 await check('artificial update comparison',async()=>{await page.getByRole('button',{name:'内部标签更新'}).click();await page.getByRole('button',{name:'开始对比'}).click();const r=await result();assert.equal(r.status,'changed');assert.deepEqual(r.changed_fields,['/site']);assert.equal(r.before.fields['/site'].value.value,'lab-a');assert.equal(r.after.fields['/site'].value.value,'lab-a-new');});
 await check('download provenance and unchanged result',async()=>{const event=page.waitForEvent('download');await page.getByRole('button',{name:'下载 JSON'}).click();const download=await event;await download.saveAs(resolve(out,'download.json'));const saved=JSON.parse(readFileSync(resolve(out,'download.json'),'utf8'));assert.equal(saved.result.status,'changed');assert.equal(saved.databases.length,2);assert.equal(saved.operation.ip,'192.0.2.1');assert.match(saved.databases[0].sha256,/^[0-9a-f]{64}$/);});
 await check('clipboard denial has useful fallback',async()=>{await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:()=>Promise.reject(new Error('test denied'))}}));await page.getByRole('button',{name:'复制 JSON'}).click();await expect(page.getByText('浏览器未允许复制，请下载 JSON，或手动选中预览文本。')).toBeVisible();});
 await check('hidden corruption and incomplete budget',async()=>{await page.getByRole('button',{name:'损坏分支检查'}).click();await page.getByRole('button',{name:'开始检查'}).click();assert.equal((await result()).code,'invalid-tree-pointer');await page.getByRole('tab',{name:'IP 查询',exact:true}).click();await page.getByRole('button',{name:'查询',exact:true}).click();assert.equal((await result()).status,'found');await page.getByRole('button',{name:'ASN 查询样例'}).click();await page.getByRole('tab',{name:'数据库检查',exact:true}).click();await page.getByText('检查预算',{exact:true}).click();await page.getByLabel('最大工作单位').fill('1');await page.getByRole('button',{name:'开始检查'}).click();assert.equal((await result()).status,'incomplete');});
 await check('help modal, keyboard and mobile layout',async()=>{await page.getByRole('button',{name:'使用说明'}).click();await expect(page.getByRole('dialog')).toBeVisible();await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).not.toBeVisible();await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:resolve(out,`${engine}-${report.transport}-mobile.png`),fullPage:true});await page.setViewportSize({width:1536,height:1024});});
 await page.getByRole('button',{name:'清空',exact:true}).click();
 await check('corrupt file with Unicode name',async()=>{await page.getByRole('tab',{name:'IP 查询',exact:true}).click();await page.getByLabel('选择数据库',{exact:true}).setInputFiles({name:'损坏 空格 🌓.mmdb',mimeType:'application/octet-stream',buffer:Buffer.from('not mmdb')});await expect(page.getByRole('alert')).toContainText('missing-metadata');await expect(page.getByRole('button',{name:'查询',exact:true})).toBeDisabled();});
 await page.getByRole('button',{name:'清空',exact:true}).click();
 assert.deepEqual(env.errors,[]);
 await check('preview boundary, malicious text and result cap',async()=>{
   for(const name of ['browser-preview','browser-html','browser-result-limit']){
    await page.getByLabel('选择数据库',{exact:true}).setInputFiles(resolve(root,'verification/local',name+'.mmdb'));
    await page.getByLabel('IP 地址',{exact:true}).fill('1.1.1.1');await page.getByRole('button',{name:'查询',exact:true}).click();await expect(page.locator('.json')).toBeVisible();
    if(name==='browser-preview'){await expect(page.getByText('预览已截断至 64 KiB；复制和下载包含完整结果。')).toBeVisible();assert.ok(Buffer.byteLength(await page.locator('.json').textContent())<=65536);}
    else if(name==='browser-html'){assert.match((await result()).record.value,/<script>/);assert.equal(await page.locator('.results img').count(),0);}
    else assert.equal((await result()).code,'browser-result-limit');
   }
   await page.getByRole('button',{name:'清空',exact:true}).click();
 });
 const production=!process.env.BROWSER_QUICK && JSON.parse(readFileSync(resolve(root,'verification/local/browser-oracle.json'),'utf8')).files.find(f=>f.mode==='production');
 if(production)await check('cancel actual City validation and recover without stale results',async()=>{
   await page.getByLabel('选择数据库',{exact:true}).setInputFiles(resolve(root,production.file));
   await expect(page.getByRole('button',{name:'重新加载',exact:true})).toBeEnabled({timeout:30000});
   await page.getByRole('tab',{name:'数据库检查',exact:true}).click();
   if(!await page.getByLabel('最大工作单位').isVisible())await page.getByText('检查预算',{exact:true}).click();
   await page.getByLabel('最大工作单位').fill('1000000000');await page.getByLabel('解码引用记录',{exact:true}).check();await page.getByRole('button',{name:'开始检查'}).click();
   await page.getByRole('button',{name:'取消操作'}).click();await expect(page.getByRole('alert')).toContainText('操作已取消');assert.equal(await page.locator('.json').count(),0);
   await page.getByRole('button',{name:'重新加载',exact:true}).click();await expect(page.getByRole('button',{name:'开始检查'})).toBeEnabled({timeout:30000});
   await page.getByRole('button',{name:'ASN 查询样例'}).click();await page.getByRole('button',{name:'查询',exact:true}).click();assert.equal((await result()).fields['/autonomous_system_number'].value.value,'64512');await page.getByRole('button',{name:'清空',exact:true}).click();
 });
 await workerHarness(page);
 const oracle=process.env.BROWSER_QUICK?{files:[]}:JSON.parse(readFileSync(resolve(root,'verification/local/browser-oracle.json'),'utf8'));
 for(const entry of oracle.files) {
   assert.equal(createHash('sha256').update(readFileSync(resolve(root,entry.file))).digest('hex'),entry.sha256);
   await page.evaluate(()=>window.testReset());
   const opened=await load(page,[entry.file]);
   if(opened.error) {assert.equal(entry.mode,'policy');assert.equal(opened.error.code,entry.query_code);report.files.push({file:entry.file,status:'opening-rejected',code:opened.error.code});continue;}
   assert.equal(opened.databases[0].sha256,entry.sha256);
   if(entry.metadata)for(const [key,value]of Object.entries(entry.metadata))assert.equal(String(opened.databases[0].metadata[key]),String(value));
   if(entry.mode==='policy') {
     const reply=await call(page,{op:'lookup',ip:entry.ip});const r=JSON.parse(reply.json||JSON.stringify(reply.error));
     if(entry.query_code)assert.equal(r.code,entry.query_code);else assert.equal(r.status,'found');report.queries++;
   } else {
     for(let start=0;start<entry.queries.length;start+=100){
       const batch=entry.queries.slice(start,start+100);
       const failures=await page.evaluate(async(batch)=>{
         function norm(v){const t=v.type,x=v.value;if(t==='map')return Object.fromEntries(Object.entries(x).map(([k,y])=>[k,norm(y)]));if(t==='array')return x.map(norm);if(t.startsWith('uint')||t==='int32')return {$integer:x};if(t==='bytes')return {$bytes:x};if(t==='float32'||t==='float64'){const size=t==='float32'?4:8;const raw=new Uint8Array(size);let bits=BigInt('0x'+v.bits);for(let i=size-1;i>=0;i--){raw[i]=Number(bits&255n);bits>>=8n;}const view=new DataView(raw.buffer),value=size===4?view.getFloat32(0):view.getFloat64(0);const wide=new DataView(new ArrayBuffer(8));wide.setFloat64(0,value);return {$float:[...new Uint8Array(wide.buffer)].map(b=>b.toString(16).padStart(2,'0')).join('')};}return x;}
         function canonical(v){if(Array.isArray(v))return v.map(canonical);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])]));return v;}
         const errors=[];for(const wanted of batch){const reply=await window.testCall({op:'lookup',ip:wanted.ip});const got=reply.json?JSON.parse(reply.json):reply.error;const value=got.record?norm(got.record):null;if(got.status!==(wanted.record===null?'not_found':'found')||got.prefix_length!==wanted.prefix||JSON.stringify(canonical(value))!==JSON.stringify(canonical(wanted.record)))errors.push({ip:wanted.ip,got,wanted});}return errors;
       },batch);
       assert.deepEqual(failures,[],entry.file);report.queries+=batch.length;
     }
   }
   const validation=await call(page,{op:'validate',decode:true,work:entry.mode==='production'?1_000_000_000:100_000_000,state:64*1024*1024});
   const v=JSON.parse(validation.json||JSON.stringify(validation.error));assert.equal(v.code??null,entry.validation_code,entry.file);
   if(!entry.validation_code)assert.equal(v.status,'valid',entry.file);
   if(entry.nodes!==undefined)assert.equal(v.checked_nodes,entry.nodes);
   report.files.push({file:entry.file,status:'passed',queries:entry.queries.length,validation:v});
   console.log(JSON.stringify({file:entry.file,queries:report.queries,validation:v.status}));
 }
 await check('worker file metadata preflight without reading payloads',async()=>{
   const outcomes=await page.evaluate(async()=>{const a=await window.testCall({op:'load',files:[{name:'oversize.mmdb',size:256*1024*1024+1}]});const b=await window.testCall({op:'load',files:[]});const c=await window.testCall({op:'load',files:[{name:'a.mmdb',size:128*1024*1024},{name:'b.mmdb',size:128*1024*1024+1}]});return [a,b,c].map(x=>x.error?.code);});assert.deepEqual(outcomes,['browser-file-limit','browser-file-count','browser-file-limit']);
 });
 await page.evaluate(()=>{window.testReset();});
 await check('application makes no data requests',async()=>{assert.ok(env.requests.every(u=>u===env.url||u.startsWith('blob:')),env.requests.join('\n'));assert.equal(await page.evaluate(()=>{try{return localStorage.length+sessionStorage.length;}catch(e){if(e.name==='SecurityError')return 0;throw e;}}),0);});
 assert.deepEqual(env.errors,[]);report.status=process.env.BROWSER_QUICK?'smoke-only':'passed';
} catch(error){report.status='failed';report.error=error.stack;process.exitCode=1;console.error(error);}
finally{report.finished=new Date().toISOString();report.requests=env.requests;report.console_errors=env.errors;writeFileSync(resolve(out,`${engine}-${report.transport}.json`),JSON.stringify(report,null,2)+'\n');await env.close();console.log(JSON.stringify({status:report.status,engine,transport:report.transport,files:report.files.length,queries:report.queries,checks:report.checks.length}));}
