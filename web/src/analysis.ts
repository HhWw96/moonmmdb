import * as core from '../../dist/core.mjs';
import * as hashing from '../../dist/browser-hash.mjs';
import {VERSION, type AnalysisOptions, type Database, type Progress} from './protocol';

const MIB=1024*1024, LINE_LIMIT=8*MIB;
function fail(code: string, message: string): never { throw {status:'error',code,offset:-1,message}; }
function checked(text: string) { if(text) throw JSON.parse(text); }

export async function analyze(options: AnalysisOptions, handles: unknown[], databases: Database[], progress: (value: Progress)=>void) {
  const {city,asn,file,ipPath,top,maxBytes,maxRecords}=options;
  if(handles.length!==2||![city,asn].every(i=>Number.isInteger(i)&&i>=0&&i<2)||city===asn) fail('browser-database-role','请分别指定两份数据库的 City 与 ASN 角色。');
  for(const [name,value,cap] of [['top',top,100],['maxBytes',maxBytes,64*MIB],['maxRecords',maxRecords,1000000]] as const)
    if(!Number.isInteger(value)||value<1||value>cap) fail('browser-invalid-limit',`${name} 必须为 1—${cap} 的整数。`);
  if(typeof ipPath!=='string'||ipPath.length>65536) fail('invalid-path','IP 路径超出限制。');
  if(!file||!Number.isSafeInteger(file.size)||file.size<0) fail('host-input-error','请选择一个 JSONL 文件。');
  if(file.size>maxBytes) fail('input-limit','日志超过配置的字节上限；浏览器最多 64 MiB，更大日志请使用 Native 工具。');
  const session=core.analysis_start(handles[city],handles[asn],top,10000,ipPath);
  try {
    checked(core.analysis_error(session));
    const hash=hashing.hash_create(), buffer=new Uint8Array(LINE_LIMIT);
    const decoder=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true});
    let used=0, bytes=0, lines=0, lastUpdate=0;
    const complete=()=>{
      if(++lines>maxRecords)fail('record-limit','日志超过配置的行数上限。');
      const length=used&&buffer[used-1]===13?used-1:used;
      let text;try{text=decoder.decode(buffer.subarray(0,length));}catch{fail('invalid-utf8',`第 ${lines} 行不是有效 UTF-8。`);}
      if(lines===1&&text.startsWith('\uFEFF'))text=text.slice(1);
      checked(core.analysis_line(session,text));used=0;
    };
    progress({bytes,total:file.size,lines});
    while(bytes<file.size) {
      let chunk: Uint8Array;
      try { chunk=new Uint8Array(await file.slice(bytes,Math.min(bytes+65536,file.size)).arrayBuffer()); }
      catch { fail('host-input-error','日志读取失败，未生成完成报告。'); }
      if(chunk.length!==Math.min(65536,file.size-bytes))fail('host-input-error','日志读取长度异常。');
      hashing.hash_update(hash,chunk);
      let start=0;
      while(start<chunk.length) {
        const newline=chunk.indexOf(10,start),end=newline<0?chunk.length:newline;
        if(used+end-start>LINE_LIMIT)fail('line-limit',`第 ${lines+1} 行超过 8 MiB。`);
        buffer.set(chunk.subarray(start,end),used);used+=end-start;start=end+1;
        if(newline>=0)complete();
      }
      bytes+=chunk.length;
      if(performance.now()-lastUpdate>=250){progress({bytes,total:file.size,lines});lastUpdate=performance.now();}
    }
    if(used)complete();
    const report=JSON.parse(core.analysis_finish(session));
    if(report.status==='error')throw report;
    const info=JSON.parse(core.analysis_metadata(session));
    for(const [role,index] of [['city',city],['asn',asn]] as const)Object.assign(info[role],{bytes:String(databases[index].bytes),sha256:databases[index].sha256});
    report.tool_version=VERSION;
    report.parameters={ip_path:ipPath,top,max_groups:10000,max_records:maxRecords,max_input_bytes:maxBytes,max_line_bytes:LINE_LIMIT,max_json_depth:128};
    report.databases=info;report.input={bytes:String(bytes),sha256:hashing.hash_finish(hash)};
    progress({bytes,total:file.size,lines});
    return JSON.stringify(report);
  } finally { core.analysis_close(session); }
}
