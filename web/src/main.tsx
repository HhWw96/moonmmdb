import {useEffect, useMemo, useRef, useState, type DragEvent} from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserClient, type Operation} from './client';
import {checkFiles, fieldsFromText, preview, VERSION, type Database, type Mode} from './protocol';
import {WorkflowPanel,RoleSelect,DiagnosticPanel,useJSONDownload,DownloadFallback} from './WorkflowPanel';
import type {Task} from './protocol';
import {AnalysisFields, AnalyticsResult, initialAnalysis, type AnalysisForm} from './Analytics';
import type {Progress} from './protocol';
import './style.css';
declare global { interface Window {__MOONMMDB_DATA__: {worker: string; samples: Record<string,string>; licenses: string; core_sha256: string; workflow_sha256: string; hash_bridge_sha256: string; worker_sha256: string}} }
const embedded = window.__MOONMMDB_DATA__;
const labels: Record<Mode,string> = {lookup:'IP 查询', validate:'数据库检查', compare:'更新对比', analyze:'日志分析'};
const statuses: Record<string,string> = {found:'查询命中', not_found:'IP 未命中', changed:'发现变化', unchanged:'检查范围内无变化', valid:'检查通过', invalid:'数据库损坏', incomplete:'检查未完成', error:'操作错误'};
type UserOperation = Extract<Operation,{op:Mode}>;
type Result = {json: string; operation: UserOperation; databases: Database[]; finished: string; report?:string; inputFile?:File};
function bytes(n: number) { return n < 1024 ? `${n} B` : `${(n/1024/1024).toFixed(2)} MiB`; }
function UploadIcon() { return <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 21V4m-6 6 6-6 6 6M5 21v7h22v-7"/></svg>; }
function Elapsed({start}: {start: number}) {
  const [now, setNow] = useState(Date.now());
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),250);return ()=>clearInterval(timer);},[]);
  return <span>正在处理 · {Math.max(0, (now-start)/1000).toFixed(1)} 秒</span>;
}
function Help({close}: {close: ()=>void}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(()=>{dialog.current?.showModal();},[]);
  return <dialog ref={dialog} onCancel={close} aria-labelledby="help-title"><div className="dialog-head"><h2 id="help-title">使用说明</h2><button onClick={close}>关闭</button></div>
    <h3>从本地文件开始</h3><p>选择 .mmdb 文件，或使用人工样例。查询支持 IPv4、IPv6；字段每行一个 JSON Pointer，例如 /country/iso_code。空白字段框表示完整记录；路径中的空格有实际含义，不会自动删除。</p>
    <h3>检查与更新对比</h3><p>数据库检查包含所有物理树节点，包括不可达节点；勾选“解码引用记录”还会检查所有被树节点引用的数据。通过不代表地理信息准确，也不代表未引用字节全部有效。</p><p>更新对比只检查输入的这一个 IP 与所选字段，不能证明整库一致。未命中、字段缺失和错误各有独立状态。</p>
    <h3>日志分析</h3><p>分别指定 City、ASN 角色并选择一个 JSONL 日志，默认读取 /ip。统计请求次数，不去重。错误行继续处理；UTF-8 损坏、读取失败或资源超限则停止，不生成完成报告。日志默认 8 MiB、10,000 行，最多 64 MiB、1,000,000 行；单行最多 8 MiB。日志原文不包含在报告中。</p><h3>跨端任务与报告复核</h3><p>导出任务保存参数、文件角色和已知散列，不含文件原文或路径。导入不会自动运行，必须重新选择文件。任务可交给 Native 或 Node 的 run-task 执行；打开报告先做内部检查，绑定原文件复验才会重新计算。内部自洽与散列相符不是独立正确性证明。</p><p>异常明细仅含行号、字节范围和类别。完成分析或原文件复验后，可以在当前选中日志中临时查看原行并带入查询；原文不会随报告导出。</p><h3>资源与取消</h3><p>最多两份库，单库及合计不得超过 256 MiB。默认检查一亿工作单位、64 MiB 辅助状态；这不是浏览器内存上限。取消会终止后台任务，需要重新加载已选文件。大文件建议使用桌面浏览器，受设备可用内存限制。</p><p>结果最多 8 MiB；预览最多 64 KiB，复制与下载保留完整结果。整数以十进制字符串保留，浮点另含原始位表示。复制受权限限制时可下载 JSON。</p>
    <h3>本地处理与离线使用</h3><p>数据库、文件名和查询 IP 不上传，不写入网址或查询历史。本页不使用持久存储或访问统计；在线打开页面仍会访问托管网站，网站可能记录此次访问。主动下载的报告包含所选文件名、输入和结果。</p><p>离线 HTML 内置所有代码、样例、说明与许可，无需服务器。首版验证桌面 Chromium、Edge 和 Firefox；不承诺 Safari 或手机大库性能。</p><a href={`https://github.com/HhWw96/moonmmdb/releases/download/v${VERSION}/moonmmdb-${VERSION}-offline.html`} target="_blank" rel="noreferrer">下载正式版离线 HTML</a>
    <details><summary>版本、来源与许可证</summary><p>MoonMMDB {VERSION} · 核心 SHA-256：<code>{embedded.core_sha256}</code></p><p>内置数据库为项目生成的人工样例，不代表真实 IP 归属。损坏样例专门包含一个普通查询不经过的非法节点。</p><pre className="licenses">{embedded.licenses}</pre></details>
  </dialog>;
}
function DatabaseInfo({database, index}: {database: Database; index: number; analysis?: boolean}) {
  const m = database.metadata;
  return <details className="database-info"><summary>{index===0?'数据库 A':'数据库 B'} · {database.name}</summary><dl>
    <dt>大小</dt><dd>{bytes(database.bytes)}</dd><dt>类型</dt><dd>{String(m.database_type)}</dd><dt>地址族</dt><dd>IPv{String(m.ip_version)}</dd><dt>节点数</dt><dd>{String(m.node_count)}</dd><dt>构建时间（Unix 秒）</dt><dd>{String(m.build_epoch)}</dd><dt>SHA-256</dt><dd><code>{database.sha256}</code></dd>
  </dl></details>;
}
function ResultPanel({result, notice, setNotice, inspect, query, save}: {result: Result|null; notice: string; setNotice: (s:string)=>void; inspect:(row:{start:string;end:string})=>Promise<{text:string;ip?:string;truncated:boolean}>; query:(ip:string)=>void; save:(value:unknown,name:string,kind:"任务"|"报告")=>void}) {
  const data = useMemo(()=>result ? JSON.parse(result.json) : null,[result]);
  const shown = useMemo(()=>result ? preview(result.json.length < 65536 ? JSON.stringify(data,null,2) : result.json) : null,[result,data]);
  const download = () => {
    if (!result) return;
    if(result.report){try{save(result.report,`moonmmdb-${result.operation.op}.json`,'报告')}catch(e){setNotice((e as Error).message)}return;}
    const report = {version:1, tool:{name:'MoonMMDB',version:VERSION,core_sha256:embedded.core_sha256,hash_bridge_sha256:embedded.hash_bridge_sha256,worker_sha256:embedded.worker_sha256}, operation:result.operation.op==='analyze'?{op:'analyze',options:{...result.operation.options,file:{name:result.operation.options.file.name,bytes:result.operation.options.file.size}}}:result.operation, databases:result.databases, finished:result.finished, result:data};
    try{save(report,`moonmmdb-${result.operation.op}.json`,'报告')}catch(e){setNotice((e as Error).message)}
  };
  const copy = async () => {try {await navigator.clipboard.writeText(result!.json);setNotice('已复制完整结果 JSON。');} catch {setNotice('浏览器未允许复制，请下载 JSON，或手动选中预览文本。');}};
  return <section className="results" aria-labelledby="result-title"><div className="result-header"><h2 id="result-title">{result?.operation.op==='analyze'?'分析结果':result?.operation.op==='compare'?'对比结果':result?.operation.op==='validate'?'检查结果':'查询结果'}</h2><div className="actions"><button disabled={!result} onClick={copy}>复制 JSON</button><button disabled={!result} onClick={download}>下载 JSON</button></div></div>
    {notice ? <p role="status" className="notice">{notice}</p> : null}
    {data ? <><div className={`outcome ${(['error','invalid','incomplete'].includes(data.status)||data.exit_code===2)?'problem':''}`} role="status"><strong>{data.status==='complete'?(data.exit_code===2?'分析完成，存在错误':data.exit_code===1?'分析完成，存在未命中':'分析完成'):statuses[data.status]??data.status}</strong>
      {data.code ? <span>{data.code} · 位置 {data.offset} · {data.message}</span> : null}
      {data.prefix_length!==undefined ? <span>匹配前缀 /{data.prefix_length}</span> : null}
      {data.status==='changed'||data.status==='unchanged' ? <><span>命中状态：{data.record_changed?'变化':'不变'} · 匹配前缀：{data.prefix_changed?'变化':'不变'}</span><span>变化字段：{data.changed_fields.length?data.changed_fields.map((p:string)=>p||'完整记录').join('、'):'无'}</span><span>仅代表本次 IP 与字段范围。</span></> : null}
      {data.checked_nodes!==undefined ? <span>已检查节点：{data.checked_nodes} · 工作单位：{data.work_used}</span> : null}
    </div>{data.status==='complete'?<><AnalyticsResult report={data}/>{data.diagnostics?<DiagnosticPanel key={result!.finished} diagnostics={data.diagnostics} canInspect={!!result!.inputFile} onInspect={inspect} onQuery={query}/>:null}</>:null}{shown!.truncated ? <p className="notice">预览已截断至 64 KiB；复制和下载包含完整结果。</p> : null}<pre className="json" tabIndex={0} aria-label="结果 JSON">{shown!.text}</pre></> : <div className="empty"><span className="code-icon" aria-hidden="true">〈/〉</span><p>结果将在这里显示</p></div>}
  </section>;
}
function App() {
  const download=useJSONDownload();
  const [client] = useState(()=>new BrowserClient(embedded.worker));
  const generation = useRef(0), files = useRef<File[]>([]);
  const errorRef=useRef<HTMLParagraphElement>(null);
  const [focusTab,setFocusTab] = useState<Mode>('lookup');
  const [mode,setMode] = useState<Mode>('lookup'), [databases,setDatabases] = useState<Database[]>([]);
  useEffect(()=>setFocusTab(mode),[mode]);
  const [selectedNames,setSelectedNames] = useState<string[]>([]), [ip,setIp] = useState(''), [fields,setFields] = useState('');
  const [decode,setDecode] = useState(false), [work,setWork] = useState('100000000'), [state,setState] = useState('64');
  const [started,setStarted] = useState<number|null>(null), [error,setError] = useState(''), [result,setResult] = useState<Result|null>(null), [notice,setNotice] = useState(''), [help,setHelp] = useState(false);
  const [analysis,setAnalysis]=useState<AnalysisForm>(initialAnalysis);
  const [progress,setProgress]=useState<Progress|null>(null);
  const [target,setTarget]=useState(0),[before,setBefore]=useState(0),[after,setAfter]=useState(1);
  const [imported,setImported]=useState<Task|null>(null),[originalReport,setOriginalReport]=useState<string|null>(null),[commandHelp,setCommandHelp]=useState('');
  const busy = started!==null;
  useEffect(()=>()=>client.close(),[client]);
  useEffect(()=>{if(error)errorRef.current?.focus();},[error]);
  function resetResult() {download.clear();setProgress(null);setResult(null);setNotice('');setError('');}
  function cancel() {download.clear();generation.current++;client.close();setStarted(null);setDatabases([]);setResult(null);setNotice('');setError('操作已取消；请重新加载已选数据库。');}
  function clear() {generation.current++;client.close();files.current=[];setSelectedNames([]);setDatabases([]);setStarted(null);setIp('');setFields('');setAnalysis({...initialAnalysis});setTarget(0);setBefore(0);setAfter(1);setImported(null);setOriginalReport(null);setCommandHelp('');resetResult();}
  async function load(next: File[]) {
    resetResult();
    try {checkFiles(next);} catch(e) {setError((e as Error).message);return;}
    const epoch=++generation.current;client.close();files.current=next;setSelectedNames(next.map(f=>f.name));setDatabases([]);resetResult();setStarted(Date.now());
    try {
      const reply = await client.request({op:'load',files:next});
      if (generation.current!==epoch) return;
      if (reply.error) {setError(`${reply.error.database??''} ${reply.error.code} · 位置 ${reply.error.offset} · ${reply.error.message}`);return;}
      setDatabases(reply.databases!);
    } catch(e) {if(generation.current===epoch)setError((e as Error).message);}
    finally {if(generation.current===epoch)setStarted(null);}
  }
  function choose(file:File|undefined, index:number) {
    if(!file)return;
    if(index===1 && !files.current[0]) {setError('请先选择旧数据库。');return;}
    const next=[...files.current];next[index]=file;void load(next);
  }
  function drop(event:DragEvent) {
    event.preventDefault();if(busy)return;
    const next=Array.from(event.dataTransfer.files);
    if(next.length===2&&mode!=='analyze')setMode('compare');void load(next);
  }
  function sample(name:'asn'|'tags'|'broken'|'analysis') {
    setImported(null);setOriginalReport(null);setCommandHelp('');setTarget(0);setBefore(0);setAfter(1);
    if(name==='analysis'){
      const file=new File([Uint8Array.from(atob(embedded.samples.log),c=>c.charCodeAt(0))],'analysis-access.jsonl');
      setAnalysis({...initialAnalysis,file});setMode('analyze');
      void load(['geo','asn'].map(n=>new File([Uint8Array.from(atob(embedded.samples[n]),c=>c.charCodeAt(0))],`${n}.mmdb`)));return;
    }
    const names=name==='tags'?['tags','updated']:[name];
    const data=names.map(n=>new File([Uint8Array.from(atob(embedded.samples[n]),c=>c.charCodeAt(0))],`${n}.mmdb`));
    setMode(name==='tags'?'compare':name==='broken'?'validate':'lookup');setIp(name==='broken'?'1.1.1.1':'192.0.2.1');setFields(name==='tags'?'/site':name==='asn'?'/autonomous_system_number':'');setDecode(false);setWork('100000000');setState('64');void load(data);
  }
  function bindings():Record<string,number> {return mode==='analyze'?{city:analysis.city,asn:analysis.asn}:mode==='compare'?{before,after}:{database:target};}
  function operation():UserOperation {return mode==='analyze'?{op:mode,options:{file:analysis.file!,city:analysis.city,asn:analysis.asn,ipPath:analysis.ipPath,top:Number(analysis.top),maxBytes:Number(analysis.maxMiB)*1048576,maxRecords:Number(analysis.maxRecords)}}:mode==='validate'?{op:mode,decode,work:Number(work),state:Number(state)*1048576}:{op:mode,ip:ip.trim(),fields:fieldsFromText(fields)};}
  function task():Task {
    const roleBindings=bindings();
    const parameters=mode==='analyze'?{ip_path:analysis.ipPath,top:Number(analysis.top),max_groups:Number(analysis.maxGroups),max_records:Number(analysis.maxRecords),max_input_bytes:Number(analysis.maxMiB)*1048576,max_line_bytes:Number(analysis.maxLineBytes),max_json_depth:128,...(Number(analysis.diagnosticLimit)?{diagnostic_limit:Number(analysis.diagnosticLimit)}:{})}:mode==='validate'?{decode_data:decode,max_work:Number(work),max_state_bytes:Number(state)*1048576}:{ip:ip.trim(),fields:fieldsFromText(fields)};
    const taskFiles=Object.entries(roleBindings).map(([role,index])=>{const expected=imported?.operation===mode?imported.files.find(f=>f.role===role):undefined;const db=databases[index!];if(expected)return {...expected};if(!db)throw new Error('请先选择所需数据库。');return {role,name:db.name,bytes:String(db.bytes),sha256:db.sha256};});
    if(mode==='analyze'){const expected=imported?.operation===mode?imported.files.find(f=>f.role==='input'):undefined;if(expected)taskFiles.push({...expected} as typeof taskFiles[number]);else{if(!analysis.file)throw new Error('请选择日志文件。');taskFiles.push({role:'input',name:analysis.file.name,bytes:String(analysis.file.size)} as typeof taskFiles[number]);}}
    return {format:'moonmmdb-task',version:1,operation:mode,parameters,files:taskFiles};
  }
  function restore(t:Task) {
    const p=t.parameters;setMode(t.operation);setTarget(0);setBefore(0);setAfter(1);
    if(t.operation==='analyze')setAnalysis({...initialAnalysis,ipPath:String(p.ip_path),top:String(p.top),maxMiB:String(Number(p.max_input_bytes)/1048576),maxRecords:String(p.max_records),maxGroups:String(p.max_groups),maxLineBytes:String(p.max_line_bytes),diagnosticLimit:String(p.diagnostic_limit??0)});
    else if(t.operation==='validate'){setDecode(Boolean(p.decode_data));setWork(String(p.max_work));setState(String(Number(p.max_state_bytes)/1048576));}
    else{setIp(String(p.ip));setFields((p.fields as string[]).join('\n'));}
  }
  async function importDocument(file:File,kind:'task'|'report') {
    clear();const epoch=generation.current;setStarted(Date.now());
    try{const reply=await client.request({op:'document',file,kind});if(epoch!==generation.current)return;if(reply.error)throw new Error(reply.error.message);const doc=JSON.parse(reply.json!);const t=kind==='task'?doc.value:doc.value.task;restore(t);setImported(t);if(kind==='report'){setOriginalReport(doc.raw);setNotice('报告内部检查通过，尚未重新计算。请重新绑定全部原文件后复验。');setResult({json:JSON.stringify(doc.value.result),operation:{op:t.operation} as UserOperation,databases:[],finished:new Date().toISOString(),report:doc.raw});}else setNotice('任务已载入，请按角色选择文件后手动运行。');}
    catch(e){if(epoch===generation.current)setError((e as Error).message)}finally{if(epoch===generation.current)setStarted(null)}
  }
  async function exportTask(command:boolean) {
    const epoch=generation.current;
    try{const value=task();setStarted(Date.now());const reply=await client.request({op:'document',kind:'task',file:new File([JSON.stringify(value)],'task.json')});if(epoch!==generation.current)return;if(reply.error)throw new Error(reply.error.message);const checked=JSON.parse(reply.json!).value as Task;download.save(JSON.stringify(checked),'moonmmdb-task.json','任务');if(command)setCommandHelp(`Windows PowerShell:\n.\\moonmmdb.exe run-task 'moonmmdb-task.json' ${checked.files.map(f=>`--bind ${f.role} '<${f.role.toUpperCase()}_FILE>'`).join(' ')} --output 'moonmmdb-report.json'\n\nLinux:\n./moonmmdb run-task 'moonmmdb-task.json' ${checked.files.map(f=>`--bind ${f.role} '<${f.role.toUpperCase()}_FILE>'`).join(' ')} --output 'moonmmdb-report.json'\n\n请将占位符替换为实际路径；保持引号。文件只在本机处理。`);else setNotice('已导出任务；在其他入口重新绑定文件即可运行。');}
    catch(e){setError((e as Error).message)}finally{if(epoch===generation.current)setStarted(null)}
  }
  async function run(verify=false) {
    const epoch=generation.current;
    try {
      if(verify && imported?.operation!==mode)throw new Error("请切回导入报告对应的操作后复验。");
      const value=verify?imported!:task(),op=operation();
      resetResult();setStarted(Date.now());
      const reply=await client.request({op:verify?'verify-report':'run-task',task:value,bindings:bindings() as Record<string,number>,file:analysis.file??undefined,report:originalReport??undefined},p=>{if(generation.current===epoch)setProgress(p)});
      if(generation.current!==epoch)return;
      if(reply.error){setResult({json:JSON.stringify(reply.error),operation:op,databases:[...databases],finished:new Date().toISOString(),report:JSON.stringify(reply.error)});setError(`${reply.error.code} · ${reply.error.message}`);return;}
      const data=JSON.parse(reply.json!);
      if(verify){setNotice(data.status==='consistent'?'原文件重新计算一致。':data.status==='different'?'复验不一致，请检查文件、参数及报告。':'复验未完成。');if(originalReport){const old=JSON.parse(originalReport);setResult({json:JSON.stringify(old.result??old),operation:op,databases:[...databases],finished:new Date().toISOString(),report:originalReport,...(data.status==='consistent'&&mode==='analyze'&&analysis.file?{inputFile:analysis.file}:{})});}}
      else {data.tool={...data.tool,core_sha256:embedded.core_sha256,workflow_sha256:embedded.workflow_sha256,hash_bridge_sha256:embedded.hash_bridge_sha256,worker_sha256:embedded.worker_sha256};setResult({json:JSON.stringify(data.result),operation:op,databases:[...databases],finished:new Date().toISOString(),report:JSON.stringify(data),...(mode==='analyze'&&analysis.file?{inputFile:analysis.file}:{})});}
    } catch(e){if(generation.current===epoch)setError((e as Error).message)}finally{if(generation.current===epoch)setStarted(null)}
  }
  async function inspect(row:{start:string;end:string}) {
    if(!result?.inputFile)throw new Error('请先完成原文件复验。');
    const data=JSON.parse(result.json),reply=await client.request({op:'line-preview',file:result.inputFile,start:Number(row.start),end:Number(row.end),pointer:data.parameters.ip_path});
    if(reply.error)throw new Error(reply.error.message);return JSON.parse(reply.json!);
  }
  return <><header><div className="brand">MoonMMDB <span>{VERSION}</span></div><nav aria-label="帮助链接"><button className="link" onClick={()=>setHelp(true)}>使用说明</button><span className="divider"/><a href="https://github.com/HhWw96/moonmmdb" target="_blank" rel="noreferrer">GitHub</a></nav></header>
    <div className="shell"><aside><h2>本地数据库</h2><label className={`dropzone ${busy?'disabled':''}`} onDragOver={e=>e.preventDefault()} onDrop={drop}><UploadIcon/><strong>{mode==='analyze'?'选择数据库 A':mode==='compare'?'选择旧 .mmdb 文件':'选择 .mmdb 文件'}</strong><span>或拖放文件到这里</span><input aria-label={mode==='analyze'?'选择数据库 A':mode==='compare'?'选择旧数据库':'选择数据库'} type="file" accept=".mmdb" disabled={busy} onChange={e=>{choose(e.target.files?.[0],0);e.target.value='';}}/></label>
      {mode==='compare'||mode==='analyze'?<label className="secondary-file">{mode==='analyze'?'选择数据库 B':'选择新 .mmdb 文件'}<input aria-label={mode==='analyze'?'选择数据库 B':'选择新数据库'} type="file" accept=".mmdb" disabled={busy} onChange={e=>{choose(e.target.files?.[0],1);e.target.value='';}}/></label>:null}
      {databases.map((db,i)=><DatabaseInfo key={db.sha256+i} database={db} index={i} analysis={mode==='analyze'}/>)}
      {selectedNames.length?<div className="file-controls"><p>{!databases.length?selectedNames.join('、'):null}</p><button disabled={busy} onClick={()=>load(files.current)}>重新加载</button><button onClick={clear}>清空</button></div>:null}
      <section className="samples"><h3>离线样例</h3><button disabled={busy} onClick={()=>sample('asn')}>ASN 查询样例</button><button disabled={busy} onClick={()=>sample('tags')}>内部标签更新</button><button disabled={busy} onClick={()=>sample('broken')}>损坏分支检查</button><button disabled={busy} onClick={()=>sample('analysis')}>日志分析样例</button><p>样例为人工数据，不代表真实 IP 归属。</p></section>
      <div className="privacy">数据库与 IP 仅在本机处理<br/>不上传，不保存查询历史</div>
    </aside><main><DownloadFallback file={download.file}/><WorkflowPanel busy={busy} task={imported} report={!!originalReport} onImport={importDocument} onExport={exportTask} onVerify={()=>run(true)} onDetach={()=>{setImported(null);setOriginalReport(null);resetResult();}}/>{commandHelp?<section className="command-help"><p>任务下载已发起。Native 下载：<a href={`https://github.com/HhWw96/moonmmdb/releases/tag/v${VERSION}`} target="_blank" rel="noreferrer">Windows / Linux</a></p><pre className="json">{commandHelp}</pre><button onClick={()=>setCommandHelp('')}>关闭运行说明</button></section>:null}<div className="tabs" role="tablist" aria-label="数据库操作" onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node|null))setFocusTab(mode)}} onKeyDown={e=>{const keys=['ArrowLeft','ArrowRight','Home','End'];if(!keys.includes(e.key))return;e.preventDefault();const buttons=Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('[role=tab]'));const index=buttons.indexOf(document.activeElement as HTMLButtonElement);const next=e.key==='Home'?0:e.key==='End'?buttons.length-1:(index+(e.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;buttons[next]?.focus();}}>{(Object.keys(labels) as Mode[]).map(key=><button key={key} id={`tab-${key}`} role="tab" tabIndex={focusTab===key?0:-1} onFocus={()=>setFocusTab(key)} aria-selected={mode===key} aria-controls="operation" disabled={busy} className={mode===key?'active':''} onClick={()=>{setMode(key);resetResult();}}>{labels[key]}</button>)}</div>
      <section id="operation" role="tabpanel" tabIndex={0} aria-labelledby={`tab-${mode}`}><h1>{mode==='lookup'?'查询 IP 记录':mode==='validate'?'检查数据库结构':mode==='analyze'?'分析本地访问日志':'比较数据库更新'}</h1><p className="intro">{mode==='lookup'?'选择本地数据库，或加载左侧样例开始。':mode==='validate'?'检查全部物理树节点，发现普通查询未经过的损坏分支。':mode==='analyze'?'选择 City、ASN 数据库和 JSONL 日志，统计国家及 ASN 来源分布。':'选择旧库和新库，查看一个 IP 的记录与字段变化。'}</p>
      {databases.length?<fieldset disabled={busy} className="analysis-roles">{mode==='lookup'||mode==='validate'?<RoleSelect label="目标数据库" databases={databases} value={target} onChange={n=>{setTarget(n);resetResult();}}/>:mode==='compare'?<><RoleSelect label="旧数据库角色" databases={databases} value={before} onChange={n=>{setBefore(n);resetResult();}}/><RoleSelect label="新数据库角色" databases={databases} value={after} onChange={n=>{setAfter(n);resetResult();}}/></>:null}</fieldset>:null}<form onSubmit={e=>{e.preventDefault();void run();}}><fieldset disabled={busy}>
        {mode==='analyze'?<AnalysisFields value={analysis} change={value=>{setAnalysis(value);resetResult();}} databases={databases}/>:mode!=='validate'?<><label htmlFor="ip">IP 地址</label><input id="ip" autoComplete="off" spellCheck={false} value={ip} onChange={e=>{setIp(e.target.value);resetResult();}} placeholder="例如 192.0.2.1 或 2001:db8::1"/><label htmlFor="fields">{mode==='compare'?'比较字段（可选）':'提取字段（可选）'}</label><textarea id="fields" rows={3} spellCheck={false} value={fields} onChange={e=>{setFields(e.target.value);resetResult();}} placeholder={'/country/iso_code\n/autonomous_system_number'}/><p className="hint">留空{mode==='compare'?'比较':'返回'}完整记录；每行一个 JSON Pointer。</p></>:<><label className="checkbox"><input type="checkbox" checked={decode} onChange={e=>{setDecode(e.target.checked);resetResult();}}/>解码引用记录</label><p className="hint">包括不可达节点引用的数据。通过不代表地理信息准确。</p><details className="limits"><summary>检查预算</summary><label htmlFor="work">最大工作单位（1—1,000,000,000）</label><input id="work" type="number" min="1" max="1000000000" step="1" value={work} onChange={e=>{setWork(e.target.value);resetResult();}}/><label htmlFor="state">辅助状态上限（MiB，最多 256）</label><input id="state" type="number" min={1/1048576} max="256" step="any" value={state} onChange={e=>{setState(e.target.value);resetResult();}}/><p className="hint">不包含数据库快照及运行时开销，不是进程内存上限。</p></details></>}
        <button className="primary" type="submit" disabled={!databases.length || ((mode==='compare'||mode==='analyze') && databases.length!==2) || (mode==='compare'&&before===after) || (mode==='analyze'?(!analysis.file||analysis.city===analysis.asn):(mode!=='validate'&&!ip.trim()))}>{mode==='lookup'?'查询':mode==='validate'?'开始检查':mode==='analyze'?'开始分析':'开始对比'}</button>
      </fieldset></form>{busy?<div className="running" role="status"><Elapsed start={started!}/>{mode==='analyze'&&progress?<span>已读取 {bytes(progress.bytes)} / {bytes(progress.total)}（{progress.total?Math.floor(progress.bytes*100/progress.total):100}%）· 已处理 {progress.lines} 行；读取结束后仍需完成报告</span>:null}<button onClick={cancel}>取消操作</button></div>:null}{error?<p ref={errorRef} tabIndex={-1} className="error" role="alert">{error}</p>:null}</section>
      <ResultPanel save={download.save} result={result} notice={notice} setNotice={setNotice} inspect={inspect} query={value=>{setMode('lookup');setIp(value);setFields('');setImported(null);setOriginalReport(null);resetResult();}}/>
    </main></div><footer>Apache-2.0 · MoonBit 原生解析</footer>{help?<Help close={()=>setHelp(false)}/>:null}</>;
}
createRoot(document.getElementById('root')!).render(<App/>);
