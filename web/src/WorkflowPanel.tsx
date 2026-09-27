import {useState} from 'react';
import type {Task,Database} from './protocol';

export function saveJSON(value:unknown,name:string) {
  const text=typeof value==='string'?value:JSON.stringify(value,null,2)+'\n';
  if(new TextEncoder().encode(text).length>8388608)throw new Error('完整文件超过 8 MiB。');
  const url=URL.createObjectURL(new Blob([text],{type:'application/json;charset=utf-8'}));
  const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function RoleSelect({label,value,onChange,databases}:{label:string;value:number;onChange:(n:number)=>void;databases:Database[]}) {
  return <label>{label}<select aria-label={label} value={value} onChange={e=>onChange(Number(e.target.value))}>{databases.map((db,i)=><option key={i} value={i}>{db.name}</option>)}</select></label>;
}
export function WorkflowPanel({busy,task,report,onImport,onExport,onVerify,onDetach}:{busy:boolean;task:Task|null;report:boolean;onImport:(file:File,kind:'task'|'report')=>void;onExport:(command:boolean)=>void;onVerify:()=>void;onDetach:()=>void}) {
  return <section className="workflow-panel" aria-label="任务与报告"><div className="workflow-actions">
    {(['task','report'] as const).map(kind=><label className="file-button" key={kind}>{kind==='task'?'导入任务':'打开报告'}<input aria-label={kind==='task'?'导入任务':'打开报告'} type="file" accept=".json" disabled={busy} onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)onImport(file,kind);}}/></label>)}
    <button disabled={busy} onClick={()=>onExport(false)}>导出任务</button><button disabled={busy} onClick={()=>onExport(true)}>在命令行运行</button>
  </div>{task?<><p>已载入{report?'报告':'任务'} · {task.operation}。请按角色重新选择文件；不会自动运行。</p><ul>{task.files.map(f=><li key={f.role}><strong>{f.role}</strong> · {f.name} · {f.sha256?`SHA-256 ${f.sha256}`:'散列尚未确定'}</li>)}</ul><button disabled={busy} onClick={onDetach}>解除导入绑定</button>{report?<button disabled={busy} onClick={onVerify}>原文件复验</button>:null}</>:null}</section>;
}
type Diagnostic={line:string;start:string;end:string;outcome:{input:string;issues:{dimension:string;category:string;code?:string;database_offset?:number}[]}};
export function DiagnosticPanel({diagnostics,canInspect,onInspect,onQuery}:{diagnostics:{retained:string;omitted:string;rows:Diagnostic[]};canInspect:boolean;onInspect:(row:Diagnostic)=>Promise<{text:string;ip?:string;truncated:boolean}>;onQuery:(ip:string)=>void}) {
  const [detail,setDetail]=useState<{text:string;ip?:string;truncated:boolean}|null>(null),[error,setError]=useState('');
  return <section className="diagnostics"><h3>异常定位</h3><p>已保留 {diagnostics.retained} 行 · 另有 {diagnostics.omitted} 行未保存明细。未命中与字段缺失不等同于查询错误。</p>
    <div className="diagnostic-list">{diagnostics.rows.map(row=><div key={row.line}><strong>第 {row.line} 行</strong><span>{row.outcome.input==='valid'?row.outcome.issues.map(i=>`${i.dimension}: ${i.category}${i.code?` (${i.code})`:''}`).join('；'):row.outcome.input}</span><button disabled={!canInspect} onClick={async()=>{setDetail(null);setError('');try{const shown=await onInspect(row);setDetail(row.outcome.input==='valid'?shown:{text:shown.text,truncated:shown.truncated})}catch(e){setError((e as Error).message)}}}>查看原行</button></div>)}</div>
    {!canInspect?<p className="hint">重新选择原日志并完成复验后，才能在本机查看原行。</p>:null}
    {error?<p role="alert">{error}</p>:null}{detail?<><p>以下为本机临时预览，不会写入报告。{detail.truncated?'已截断到 64 KiB。':''}</p><pre className="json">{detail.text}</pre>{detail.ip?<button onClick={()=>onQuery(detail.ip!)}>带入 IP 查询</button>:null}<button onClick={()=>setDetail(null)}>关闭原行预览</button></>:null}
  </section>;
}
