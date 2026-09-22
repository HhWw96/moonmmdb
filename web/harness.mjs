import {chromium,firefox} from '@playwright/test';
import {createServer} from 'node:http';
import {readFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
export const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export const out=resolve(root,'verification/local/browser');mkdirSync(out,{recursive:true});
export async function environment(engine='chromium',file=false) {
  if(file&&!process.env.CI)throw new Error('Local file URL testing is reserved for isolated CI. Local preview uses an artifact-only server.');
  const html=readFileSync(resolve(root,'dist/web/index.html'));
  const server=createServer((req,res)=>{if(req.url!=='/'){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}).end(html);});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browserServer=await (engine==='firefox'?firefox:chromium).launchServer({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
  const browser=await (engine==='firefox'?firefox:chromium).connect(browserServer.wsEndpoint());
  const context=await browser.newContext({viewport:{width:1536,height:1024},acceptDownloads:true});
  const page=await context.newPage();
  const errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  page.on('request',r=>requests.push(r.url()));
  const url=file?pathToFileURL(resolve(root,'dist/web/index.html')).href:`http://127.0.0.1:${server.address().port}/`;
  if(file)await context.setOffline(true);
  await page.goto(url);await page.getByRole('heading',{name:'查询 IP 记录'}).waitFor();
  return {page,context,browser,errors,requests,url,pid:browserServer.process().pid,close:async()=>{await browser.close();await browserServer.close();await new Promise(r=>server.close(r));}};
}
export async function workerHarness(page) {
  await page.evaluate(()=>{
    const input=document.createElement('input');input.type='file';input.multiple=true;input.id='test-files';input.hidden=true;document.body.append(input);
    let worker, pending, id=0;
    window.testReset=()=>{worker?.terminate();if(pending)pending.reject(new Error('test-reset'));pending=null;const url=URL.createObjectURL(new Blob([window.__MOONMMDB_DATA__.worker],{type:'text/javascript'}));worker=new Worker(url);URL.revokeObjectURL(url);worker.onmessage=({data})=>{if(pending?.id===data.id){const p=pending;pending=null;p.resolve(data);}};worker.onerror=()=>{pending?.reject(new Error('worker-error'));pending=null;};};
    window.testCall=operation=>new Promise((resolve,reject)=>{if(pending)throw new Error('test concurrent request');const requestId=++id;pending={id:requestId,resolve,reject};worker.postMessage({...operation,id:requestId});});
    window.testReset();
  });
}
export async function load(page, paths) {
  await page.locator('#test-files').setInputFiles(paths.map(p=>resolve(root,p)));
  return page.evaluate(()=>window.testCall({op:'load',files:Array.from(document.querySelector('#test-files').files)}));
}
export async function call(page, operation) {return page.evaluate(op=>window.testCall(op),operation);}
