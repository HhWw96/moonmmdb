import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {expect} from '@playwright/test';
import {environment,workerHarness,load,call,root,out} from './harness.mjs';
const engine=process.env.BROWSER_ENGINE||'chromium',file=process.argv.includes('--file');
const env=await environment(engine,file),{page}=env;
const dir=resolve(out,`workflow-${engine}-${file?'file':'http'}`);mkdirSync(dir,{recursive:true});
const report={status:'running',browser:env.browser.version(),engine,transport:file?'file':'http',checks:[],hosts:[],html_sha256:createHash('sha256').update(readFileSync(resolve(root,'dist/web/index.html'))).digest('hex')};
const db=name=>resolve(root,'tests/scenarios',name+'.mmdb'),input=resolve(root,'examples/analysis-access.jsonl');
const roles={lookup:{database:db('asn')},validate:{database:db('asn')},compare:{before:db('tags'),after:db('tags-updated')},analyze:{city:db('geo'),asn:db('asn'),input}};
const commands={node:[process.execPath,resolve(root,'bin/moonmmdb.mjs')]};
const native=resolve(root,'dist',process.platform==='win32'?'moonmmdb.exe':'moonmmdb');
if(existsSync(native))commands.native=[native];
if(process.env.CI)assert.ok(commands.native,'Formal workflow acceptance requires Native interoperation');
report.hosts=Object.keys(commands);
const cli=(command,args)=>{const r=spawnSync(command[0],[...command.slice(1),...args],{cwd:root,encoding:'utf8',timeout:30000});assert.ifError(r.error);return r;};
const json=async()=>JSON.parse(await page.getByLabel('结果 JSON',{exact:true}).textContent());
async function download(button,path){const event=page.waitForEvent('download');await page.getByRole('button',{name:button,exact:true}).click();await (await event).saveAs(path);return JSON.parse(readFileSync(path,'utf8'));}
async function bindUI(op){
 if(op==='analyze') {await page.getByLabel('选择数据库 A',{exact:true}).setInputFiles(roles[op].city);await expect(page.getByText('dbip',{exact:true})).toHaveCount(0);await page.getByRole('button',{name:'重新加载',exact:true}).waitFor();await page.getByLabel('选择数据库 B',{exact:true}).setInputFiles(roles[op].asn);await page.getByLabel('选择 JSONL 日志',{exact:true}).setInputFiles(input);}
 else if(op==='compare'){await page.getByLabel('选择旧数据库',{exact:true}).setInputFiles(roles[op].before);await page.getByRole('button',{name:'重新加载',exact:true}).waitFor();await page.getByLabel('选择新数据库',{exact:true}).setInputFiles(roles[op].after);}
 else await page.getByLabel('选择数据库',{exact:true}).setInputFiles(roles[op].database);
 await expect(page.getByRole('button',{name:'重新加载',exact:true})).toBeEnabled();
}
try {
 // Manual activation: arrows only move focus, Enter activates the focused tab.
 const lookup=page.getByRole('tab',{name:'IP 查询',exact:true});await lookup.focus();await page.keyboard.press('End');await expect(page.getByRole('tab',{name:'日志分析',exact:true})).toBeFocused();await expect(lookup).toHaveAttribute('aria-selected','true');await page.keyboard.press('Shift+Tab');assert.notEqual(await page.evaluate(()=>document.activeElement.getAttribute('role')),'tab');await lookup.focus();await page.keyboard.press('End');await page.keyboard.press('Enter');await expect(page.getByRole('tab',{name:'日志分析',exact:true})).toHaveAttribute('aria-selected','true');await page.keyboard.press('Home');await page.keyboard.press('Space');await expect(lookup).toHaveAttribute('aria-selected','true');report.checks.push('manual keyboard tab activation');
 // Actual exported UI tasks -> Node and Native -> browser report import -> original-file replay.
 for(const [op,sample] of Object.entries({lookup:'ASN 查询样例',validate:'损坏分支检查',compare:'内部标签更新',analyze:'日志分析样例'})){
   if(op==='validate'){await page.getByLabel('导入任务',{exact:true}).setInputFiles(resolve(root,'examples/tasks/validate.json'));await expect(page.getByText('任务已载入，请按角色选择文件后手动运行。',{exact:true})).toBeVisible();await bindUI(op);}
   else {await page.getByRole('button',{name:sample,exact:true}).click();await expect(page.getByRole('button',{name:'重新加载',exact:true})).toBeEnabled();}
   const taskPath=resolve(dir,op+'-task.json'),task=await download('导出任务',taskPath);
   assert.equal(task.operation,op);assert.equal(task.format,'moonmmdb-task');
   const retryTask=page.waitForEvent('download');await page.getByRole('link',{name:'再次保存任务 JSON',exact:true}).click();const retryPath=resolve(dir,op+'-task-retry.json');await(await retryTask).saveAs(retryPath);assert.deepEqual(readFileSync(retryPath),readFileSync(taskPath));
   for(const [host,command] of Object.entries(commands)){
     const dest=resolve(dir,op+'-'+host+'.json');const bindings=Object.entries(roles[op]).flatMap(([role,path])=>['--bind',role,path]);
     const run=cli(command,['run-task',taskPath,...bindings,'--output',dest,'--overwrite']);assert.ok([0,1].includes(run.status),run.stderr);
     await page.getByLabel('打开报告',{exact:true}).setInputFiles(dest);await expect(page.getByText('报告内部检查通过，尚未重新计算。请重新绑定全部原文件后复验。',{exact:true})).toBeVisible();
     assert.equal(await page.getByRole('button',{name:'重新加载',exact:true}).count(),0,'Import must not retain or execute old files');
     await bindUI(op);await page.getByRole('button',{name:'原文件复验',exact:true}).click();await expect(page.getByText('原文件重新计算一致。',{exact:true})).toBeVisible();
     await expect(page.getByRole('link',{name:'再次保存任务 JSON',exact:true})).toHaveCount(0);
     const exported=resolve(dir,op+'-'+host+'-download.json');const saved=await download('下载 JSON',exported);assert.equal(saved.format,'moonmmdb-report');assert.deepEqual(saved.result,(await json()));
     const retryReport=page.waitForEvent('download');await page.getByRole('link',{name:'再次保存报告 JSON',exact:true}).click();const savedRetry=resolve(dir,op+'-'+host+'-retry.json');await(await retryReport).saveAs(savedRetry);assert.deepEqual(readFileSync(savedRetry),readFileSync(exported));
     if(op==='analyze'){assert.equal((await json()).diagnostics.retained,'1');await page.getByRole('button',{name:'查看原行',exact:true}).click();await expect(page.getByText('以下为本机临时预览，不会写入报告。',{exact:true})).toBeVisible();await page.getByRole('button',{name:'关闭原行预览',exact:true}).click();}
     report.checks.push(`${op}: exported task -> ${host} -> imported report -> replay`);
   }
 }
 await page.getByRole('button',{name:'查看原行',exact:true}).click();await page.getByRole('button',{name:'带入 IP 查询',exact:true}).click();await expect(page.getByRole('tab',{name:'IP 查询',exact:true})).toHaveAttribute('aria-selected','true');await expect(page.getByLabel('目标数据库',{exact:true})).toBeVisible();report.checks.push('diagnostic local preview and explicit lookup target');
 await page.getByLabel('打开报告',{exact:true}).setInputFiles(resolve(dir,'lookup-node.json'));await expect(page.getByText('报告内部检查通过，尚未重新计算。请重新绑定全部原文件后复验。',{exact:true})).toBeVisible();await page.getByLabel('选择数据库',{exact:true}).setInputFiles(db('geo'));await expect(page.getByRole('button',{name:'重新加载',exact:true})).toBeEnabled();await page.getByRole('button',{name:'原文件复验',exact:true}).click();await expect(page.getByText('复验不一致，请检查文件、参数及报告。',{exact:true})).toBeVisible();report.checks.push('replaced source mismatch');
 const tampered=JSON.parse(readFileSync(resolve(dir,'analyze-node.json')));tampered.result.requests='999';await page.getByLabel('打开报告',{exact:true}).setInputFiles({name:'tampered.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(tampered))});await expect(page.getByRole('alert')).toBeVisible();await expect(page.getByRole('alert')).toBeFocused();report.checks.push('tampered report rejected and focus restored');
 // Worker-level 100000 rows with two-dimension diagnostics and precise omitted count.
 await workerHarness(page);assert.ok((await load(page,['tests/scenarios/geo.mmdb','tests/scenarios/asn.mmdb'])).databases);
 const t=JSON.parse(readFileSync(resolve(root,'examples/tasks/analyze.json')));t.parameters.max_records=100000;t.parameters.diagnostic_limit=1000;
 const large=await page.evaluate(task=>window.testCall({op:'run-task',task,bindings:{city:0,asn:1},file:new File(['{"ip":"203.0.113.1"}\r\n'.repeat(100000)],'规模 🌕.jsonl')}),t);
 assert.ok(large.json,JSON.stringify(large));const full=JSON.parse(large.json);assert.equal(full.result.requests,'100000');assert.equal(full.result.diagnostics.retained,'1000');assert.equal(full.result.diagnostics.omitted,'99000');assert.equal(full.result.diagnostics.rows[0].outcome.issues.length,2);
 const repeated=await page.evaluate(({task,report})=>window.testCall({op:'verify-report',task,report,bindings:{city:0,asn:1},file:new File(['{"ip":"203.0.113.1"}\r\n'.repeat(100000)],'renamed.jsonl')}),{task:full.task,report:large.json});assert.equal(JSON.parse(repeated.json).status,'consistent');report.checks.push('100000 rows, full diagnostic buffer, renamed file replay');
 const oversized=await page.evaluate(task=>window.testCall({op:'run-task',task,bindings:{city:0,asn:1},file:new File([new Uint8Array(64*1048576+1)],'too-big.jsonl')}),{...t,parameters:{...t.parameters,max_input_bytes:1073741824}});assert.ok(oversized.error);report.checks.push('CLI-only task cannot relax browser cap');
 await page.getByRole('button',{name:'日志分析样例',exact:true}).click();await expect(page.getByRole('button',{name:'开始分析',exact:true})).toBeEnabled();await page.getByRole('button',{name:'开始分析',exact:true}).click();await expect(page.getByText('分析完成，存在未命中',{exact:true})).toBeVisible();
 await page.screenshot({path:resolve(dir,'desktop.png'),fullPage:true});await page.setViewportSize({width:390,height:844});await page.screenshot({path:resolve(dir,'mobile.png'),fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 assert.deepEqual(env.errors,[]);assert.ok(env.requests.every(u=>u===env.url||u.startsWith('blob:')||u.startsWith('data:')));report.status='passed';
} catch(e){report.status='failed';report.error=e.stack;process.exitCode=1;console.error(e);}
finally{writeFileSync(resolve(dir,'report.json'),JSON.stringify(report,null,2)+'\n');await env.close();console.log(JSON.stringify(report));}
