import {useEffect, useMemo, useRef, useState, type DragEvent} from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserClient, type Operation} from './client';
import {checkFiles, fieldsFromText, preview, VERSION, type Database, type Mode} from './protocol';
import './style.css';
declare global { interface Window {__MOONMMDB_DATA__: {worker: string; samples: Record<string,string>; licenses: string; core_sha256: string}} }
const embedded = window.__MOONMMDB_DATA__;
const labels: Record<Mode,string> = {lookup:'IP 查询', validate:'数据库检查', compare:'更新对比'};
const statuses: Record<string,string> = {found:'查询命中', not_found:'IP 未命中', changed:'发现变化', unchanged:'检查范围内无变化', valid:'检查通过', invalid:'数据库损坏', incomplete:'检查未完成', error:'操作错误'};
type Result = {json: string; operation: Operation; databases: Database[]; finished: string};
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
    <h3>资源与取消</h3><p>最多两份库，单库及合计不得超过 256 MiB。默认检查一亿工作单位、64 MiB 辅助状态；这不是浏览器内存上限。取消会终止后台任务，需要重新加载已选文件。大文件建议使用桌面浏览器，受设备可用内存限制。</p><p>结果最多 8 MiB；预览最多 64 KiB，复制与下载保留完整结果。整数以十进制字符串保留，浮点另含原始位表示。复制受权限限制时可下载 JSON。</p>
    <h3>本地处理与离线使用</h3><p>数据库、文件名和查询 IP 不上传，不写入网址或查询历史。本页不使用持久存储或访问统计；在线打开页面仍会访问托管网站，网站可能记录此次访问。主动下载的报告包含所选文件名、输入和结果。</p><p>离线 HTML 内置所有代码、样例、说明与许可，无需服务器。首版验证桌面 Chromium、Edge 和 Firefox；不承诺 Safari 或手机大库性能。</p><a href="https://github.com/HhWw96/moonmmdb/releases/download/v0.8.0/moonmmdb-0.8.0-offline.html" target="_blank" rel="noreferrer">下载正式版离线 HTML</a>
    <details><summary>版本、来源与许可证</summary><p>MoonMMDB {VERSION} · 核心 SHA-256：<code>{embedded.core_sha256}</code></p><p>内置数据库为项目生成的人工样例，不代表真实 IP 归属。损坏样例专门包含一个普通查询不经过的非法节点。</p><pre className="licenses">{embedded.licenses}</pre></details>
  </dialog>;
}
function DatabaseInfo({database, index}: {database: Database; index: number}) {
  const m = database.metadata;
  return <details className="database-info"><summary>{index===0?'当前库／旧库':'新库'} · {database.name}</summary><dl>
    <dt>大小</dt><dd>{bytes(database.bytes)}</dd><dt>类型</dt><dd>{String(m.database_type)}</dd><dt>地址族</dt><dd>IPv{String(m.ip_version)}</dd><dt>节点数</dt><dd>{String(m.node_count)}</dd><dt>构建时间（Unix 秒）</dt><dd>{String(m.build_epoch)}</dd><dt>SHA-256</dt><dd><code>{database.sha256}</code></dd>
  </dl></details>;
}
function ResultPanel({result, notice, setNotice}: {result: Result|null; notice: string; setNotice: (s:string)=>void}) {
  const data = useMemo(()=>result ? JSON.parse(result.json) : null,[result]);
  const shown = useMemo(()=>result ? preview(result.json.length < 65536 ? JSON.stringify(data,null,2) : result.json) : null,[result,data]);
  const download = () => {
    if (!result) return;
    const report = {version:1, tool:{name:'MoonMMDB',version:VERSION,core_sha256:embedded.core_sha256}, operation:result.operation, databases:result.databases, finished:result.finished, result:data};
    const url = URL.createObjectURL(new Blob([JSON.stringify(report,null,2)+'\n'],{type:'application/json;charset=utf-8'}));
    const link = document.createElement('a'); link.href=url; link.download=`moonmmdb-${result.operation.op}.json`; link.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  const copy = async () => {try {await navigator.clipboard.writeText(result!.json);setNotice('已复制完整结果 JSON。');} catch {setNotice('浏览器未允许复制，请下载 JSON，或手动选中预览文本。');}};
  return <section className="results" aria-labelledby="result-title"><div className="result-header"><h2 id="result-title">{result?.operation.op==='compare'?'对比结果':result?.operation.op==='validate'?'检查结果':'查询结果'}</h2><div className="actions"><button disabled={!result} onClick={copy}>复制 JSON</button><button disabled={!result} onClick={download}>下载 JSON</button></div></div>
    {notice ? <p role="status" className="notice">{notice}</p> : null}
    {data ? <><div className={`outcome ${['error','invalid','incomplete'].includes(data.status)?'problem':''}`} role="status"><strong>{statuses[data.status]??data.status}</strong>
      {data.code ? <span>{data.code} · 位置 {data.offset} · {data.message}</span> : null}
      {data.prefix_length!==undefined ? <span>匹配前缀 /{data.prefix_length}</span> : null}
      {data.status==='changed'||data.status==='unchanged' ? <><span>命中状态：{data.record_changed?'变化':'不变'} · 匹配前缀：{data.prefix_changed?'变化':'不变'}</span><span>变化字段：{data.changed_fields.length?data.changed_fields.map((p:string)=>p||'完整记录').join('、'):'无'}</span><span>仅代表本次 IP 与字段范围。</span></> : null}
      {data.checked_nodes!==undefined ? <span>已检查节点：{data.checked_nodes} · 工作单位：{data.work_used}</span> : null}
    </div>{shown!.truncated ? <p className="notice">预览已截断至 64 KiB；复制和下载包含完整结果。</p> : null}<pre className="json" tabIndex={0} aria-label="结果 JSON">{shown!.text}</pre></> : <div className="empty"><span className="code-icon" aria-hidden="true">〈/〉</span><p>结果将在这里显示</p></div>}
  </section>;
}
function App() {
  const [client] = useState(()=>new BrowserClient(embedded.worker));
  const generation = useRef(0), files = useRef<File[]>([]);
  const [mode,setMode] = useState<Mode>('lookup'), [databases,setDatabases] = useState<Database[]>([]);
  const [selectedNames,setSelectedNames] = useState<string[]>([]), [ip,setIp] = useState(''), [fields,setFields] = useState('');
  const [decode,setDecode] = useState(false), [work,setWork] = useState('100000000'), [state,setState] = useState('64');
  const [started,setStarted] = useState<number|null>(null), [error,setError] = useState(''), [result,setResult] = useState<Result|null>(null), [notice,setNotice] = useState(''), [help,setHelp] = useState(false);
  const busy = started!==null;
  useEffect(()=>()=>client.close(),[client]);
  function resetResult() {setResult(null);setNotice('');setError('');}
  function cancel() {generation.current++;client.close();setStarted(null);setDatabases([]);setResult(null);setNotice('');setError('操作已取消；请重新加载已选数据库。');}
  function clear() {generation.current++;client.close();files.current=[];setSelectedNames([]);setDatabases([]);setStarted(null);setIp('');setFields('');resetResult();}
  async function load(next: File[]) {
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
    if(next.length===2)setMode('compare');void load(next);
  }
  function sample(name:'asn'|'tags'|'broken') {
    const names=name==='tags'?['tags','updated']:[name];
    const data=names.map(n=>new File([Uint8Array.from(atob(embedded.samples[n]),c=>c.charCodeAt(0))],`${n}.mmdb`));
    setMode(name==='tags'?'compare':name==='broken'?'validate':'lookup');setIp(name==='broken'?'1.1.1.1':'192.0.2.1');setFields(name==='tags'?'/site':name==='asn'?'/autonomous_system_number':'');setDecode(false);setWork('100000000');setState('64');void load(data);
  }
  async function run() {
    let operation:Operation;
    try {
      operation=mode==='validate'?{op:mode,decode,work:Number(work),state:Number(state)*1024*1024}:{op:mode,ip:ip.trim(),fields:fieldsFromText(fields)};
    } catch(e) {setError((e as Error).message);return;}
    const epoch=generation.current;resetResult();setStarted(Date.now());
    try {
      const reply=await client.request(operation);
      if(generation.current!==epoch)return;
      setResult({json:reply.json??JSON.stringify(reply.error),operation,databases:[...databases],finished:new Date().toISOString()});
    } catch(e) {if(generation.current===epoch){setError((e as Error).message);setDatabases([]);}}
    finally {if(generation.current===epoch)setStarted(null);}
  }
  return <><header><div className="brand">MoonMMDB <span>{VERSION}</span></div><nav aria-label="帮助链接"><button className="link" onClick={()=>setHelp(true)}>使用说明</button><span className="divider"/><a href="https://github.com/HhWw96/moonmmdb" target="_blank" rel="noreferrer">GitHub</a></nav></header>
    <div className="shell"><aside><h2>本地数据库</h2><label className={`dropzone ${busy?'disabled':''}`} onDragOver={e=>e.preventDefault()} onDrop={drop}><UploadIcon/><strong>{mode==='compare'?'选择旧 .mmdb 文件':'选择 .mmdb 文件'}</strong><span>或拖放文件到这里</span><input aria-label={mode==='compare'?'选择旧数据库':'选择数据库'} type="file" accept=".mmdb" disabled={busy} onChange={e=>{choose(e.target.files?.[0],0);e.target.value='';}}/></label>
      {mode==='compare'?<label className="secondary-file">选择新 .mmdb 文件<input aria-label="选择新数据库" type="file" accept=".mmdb" disabled={busy} onChange={e=>{choose(e.target.files?.[0],1);e.target.value='';}}/></label>:null}
      {databases.map((db,i)=><DatabaseInfo key={db.sha256+i} database={db} index={i}/>)}
      {selectedNames.length?<div className="file-controls"><p>{!databases.length?selectedNames.join('、'):null}</p><button disabled={busy} onClick={()=>load(files.current)}>重新加载</button><button onClick={clear}>清空</button></div>:null}
      <section className="samples"><h3>离线样例</h3><button disabled={busy} onClick={()=>sample('asn')}>ASN 查询样例</button><button disabled={busy} onClick={()=>sample('tags')}>内部标签更新</button><button disabled={busy} onClick={()=>sample('broken')}>损坏分支检查</button><p>样例为人工数据，不代表真实 IP 归属。</p></section>
      <div className="privacy">数据库与 IP 仅在本机处理<br/>不上传，不保存查询历史</div>
    </aside><main><div className="tabs" role="tablist" aria-label="数据库操作">{(Object.keys(labels) as Mode[]).map(key=><button key={key} role="tab" aria-selected={mode===key} aria-controls="operation" disabled={busy} className={mode===key?'active':''} onClick={()=>{setMode(key);resetResult();}}>{labels[key]}</button>)}</div>
      <section id="operation" role="tabpanel" aria-label={labels[mode]}><h1>{mode==='lookup'?'查询 IP 记录':mode==='validate'?'检查数据库结构':'比较数据库更新'}</h1><p className="intro">{mode==='lookup'?'选择本地数据库，或加载左侧样例开始。':mode==='validate'?'检查全部物理树节点，发现普通查询未经过的损坏分支。':'选择旧库和新库，查看一个 IP 的记录与字段变化。'}</p>
      <form onSubmit={e=>{e.preventDefault();void run();}}><fieldset disabled={busy}>
        {mode!=='validate'?<><label htmlFor="ip">IP 地址</label><input id="ip" autoComplete="off" spellCheck={false} value={ip} onChange={e=>{setIp(e.target.value);resetResult();}} placeholder="例如 192.0.2.1 或 2001:db8::1"/><label htmlFor="fields">{mode==='compare'?'比较字段（可选）':'提取字段（可选）'}</label><textarea id="fields" rows={3} spellCheck={false} value={fields} onChange={e=>{setFields(e.target.value);resetResult();}} placeholder={'/country/iso_code\n/autonomous_system_number'}/><p className="hint">留空{mode==='compare'?'比较':'返回'}完整记录；每行一个 JSON Pointer。</p></>:<><label className="checkbox"><input type="checkbox" checked={decode} onChange={e=>{setDecode(e.target.checked);resetResult();}}/>解码引用记录</label><p className="hint">包括不可达节点引用的数据。通过不代表地理信息准确。</p><details className="limits"><summary>检查预算</summary><label htmlFor="work">最大工作单位（1—1,000,000,000）</label><input id="work" type="number" min="1" max="1000000000" step="1" value={work} onChange={e=>{setWork(e.target.value);resetResult();}}/><label htmlFor="state">辅助状态上限（MiB，1—256）</label><input id="state" type="number" min="1" max="256" step="1" value={state} onChange={e=>{setState(e.target.value);resetResult();}}/><p className="hint">不包含数据库快照及运行时开销，不是进程内存上限。</p></details></>}
        <button className="primary" type="submit" disabled={!databases.length || (mode==='compare' && databases.length!==2) || (mode!=='validate'&&!ip.trim())}>{mode==='lookup'?'查询':mode==='validate'?'开始检查':'开始对比'}</button>
      </fieldset></form>{busy?<div className="running" role="status"><Elapsed start={started!}/><button onClick={cancel}>取消操作</button></div>:null}{error?<p className="error" role="alert">{error}</p>:null}</section>
      <ResultPanel result={result} notice={notice} setNotice={setNotice}/>
    </main></div><footer>Apache-2.0 · MoonBit 原生解析</footer>{help?<Help close={()=>setHelp(false)}/>:null}</>;
}
createRoot(document.getElementById('root')!).render(<App/>);
