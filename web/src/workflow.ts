import * as core from '../../dist/core.mjs';
import * as policy from '../../dist/workflow.mjs';
import {analyze} from './analysis';
import {VERSION,type Task,type TaskFile,type Database,type Progress} from './protocol';

export function checked(text:string) {const value=JSON.parse(text);if(value.status==='error')throw value;return value;}
function fail(code:string,message:string):never{throw {status:'error',code,offset:-1,message};}
function source(expected:TaskFile,actual:{sha256:string;bytes:string|number}) {
  if(expected.sha256!==undefined&&expected.sha256!==actual.sha256||expected.bytes!==undefined&&expected.bytes!==String(actual.bytes))fail('source-mismatch',`所选文件不符合 ${expected.role} 角色的散列或大小。`);
}
export async function readDocument(file:File,kind:'task'|'report') {
  const cap=kind==='task'?65536:8388608;
  if(!file||file.size>cap)fail('document-limit',`文件超过 ${kind==='task'?'64 KiB':'8 MiB'}。`);
  let raw:string;try{raw=new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer());}catch{fail('host-input-error','无法读取 UTF-8 文件。');}
  const value=checked(kind==='task'?policy.task_check(raw):policy.report_check(raw));
  return {value,raw};
}
export async function execute(task:Task,bindings:Record<string,number>,file:File|undefined,handles:unknown[],databases:Database[],progress:(p:Progress)=>void) {
  task=checked(policy.task_check(JSON.stringify(task))) as Task;
  const expectedRoles=task.files.filter(f=>f.role!=='input');
  if(Object.keys(bindings).length!==expectedRoles.length||expectedRoles.some(f=>!Object.hasOwn(bindings,f.role)))fail('invalid-binding','请绑定每个数据库角色。');
  const ids=Object.values(bindings);
  if(new Set(ids).size!==ids.length||ids.some(i=>!Number.isInteger(i)||i<0||i>=handles.length))fail('invalid-binding','请为各角色选择不同的已加载数据库。');
  const actualFiles:TaskFile[]=expectedRoles.map(f=>{const db=databases[bindings[f.role]];source(f,db);return {...f,bytes:String(db.bytes),sha256:db.sha256};});
  const p=task.parameters;
  let result;
  if(task.operation==='analyze') {
    if(!file)fail('host-input-error','请重新选择 JSONL 日志。');
    const expected=task.files.find(f=>f.role==='input')!;
    if(expected.bytes!==undefined&&expected.bytes!==String(file.size))fail('source-mismatch','日志大小与任务不符。');
    result=JSON.parse(await analyze({file,city:bindings.city,asn:bindings.asn,ipPath:p.ip_path as string,top:p.top as number,maxBytes:p.max_input_bytes as number,maxRecords:p.max_records as number,maxLineBytes:p.max_line_bytes as number,maxGroups:p.max_groups as number,diagnosticLimit:p.diagnostic_limit as number|undefined},handles,databases,progress));
    source(expected,result.input);actualFiles.push({...expected,...result.input});
    // The completed report records effective optional defaults.
    task={...task,parameters:result.parameters};
  } else if(task.operation==='validate')result=JSON.parse(core.validate_database(handles[bindings.database],p.decode_data as boolean,p.max_work as number,p.max_state_bytes as number));
  else {
    const paths=p.fields as string[],selection=core.prepare_fields(paths.length?paths:['']);checked(core.selection_status(selection));
    result=JSON.parse(task.operation==='compare'?core.compare_prepared(handles[bindings.before],handles[bindings.after],p.ip as string,selection):paths.length?core.project_prepared(handles[bindings.database],p.ip as string,selection):core.lookup(handles[bindings.database],p.ip as string));
  }
  if(new TextEncoder().encode(JSON.stringify(result)).length>8388608)fail('browser-result-limit','结果超过 8 MiB；请缩小字段范围或使用命令行工具。');
  const operation=task.operation==='analyze'?{op:'analyze',options:{city:0,asn:1,ipPath:p.ip_path,top:p.top,maxBytes:p.max_input_bytes,maxRecords:p.max_records,file:{name:file!.name,bytes:file!.size}}}:task.operation==='validate'?{op:'validate',decode:p.decode_data,work:p.max_work,state:p.max_state_bytes}:{op:task.operation,ip:p.ip,fields:p.fields};
  const report={format:'moonmmdb-report',version:1,tool:{name:'MoonMMDB',version:VERSION},operation,databases:expectedRoles.map(f=>databases[bindings[f.role]]),task:{...task,files:actualFiles},finished:new Date().toISOString(),result};
  const raw=JSON.stringify(report);
  if(new TextEncoder().encode(raw).length>8388608)fail('report-limit','完整报告超过 8 MiB。');
  checked(policy.report_check(raw));
  return raw;
}
export const compareReports=(expected:string,actual:string)=>checked(policy.report_compare(expected,actual));
