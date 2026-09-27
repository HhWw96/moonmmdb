// File transport and binding only. Task/report policy is compiled MoonBit.
import {statSync, lstatSync, realpathSync, openSync, closeSync, writeSync, fsyncSync, linkSync, unlinkSync, renameSync} from 'node:fs';
import {resolve, dirname, basename, join} from 'node:path';
import {randomUUID, createHash} from 'node:crypto';
import * as workflow from '../dist/workflow.mjs';
import * as core from '../dist/core.mjs';
import {VERSION} from './version.mjs';
import {readFileBounded} from './many.mjs';
import {InputError} from './jsonl.mjs';
import {analyze} from './analyze.mjs';

export function checked(text) {
  const value=JSON.parse(text);
  if(value.status==='error'){const error=new InputError(value.code,value.message??value.code);if(Number.isInteger(value.offset))error.offset=value.offset;throw error;}
  return value;
}
const textFile=(path,limit)=>new TextDecoder('utf-8',{fatal:true}).decode(readFileBounded(path,limit));
function options(args) {
  const bindings=new Map(); let output=null, overwrite=false;
  for(let i=0;i<args.length;) {
    const flag=args[i++];
    if(flag==='--bind') {
      const role=args[i++],path=args[i++];
      if(!role||!path||bindings.has(role)||path==='-')throw new InputError('invalid-binding','Expected unique role and regular file path');
      bindings.set(role,path);
    } else if(flag==='--output'&&!output) {output=args[i++];if(!output)throw new InputError('host-input-error','Missing output path');}
    else if(flag==='--overwrite'&&!overwrite)overwrite=true;
    else throw new InputError('host-input-error','Unknown or duplicate option');
  }
  if(overwrite&&!output)throw new InputError('host-input-error','--overwrite requires --output');
  return {bindings,output,overwrite};
}
function existing(path) {try{return lstatSync(path)}catch(e){if(e.code==='ENOENT')return null;throw e}}
function outputCheck(path,protectedPaths,overwrite) {
  const dest=resolve(path), info=existing(dest);
  if(info?.isSymbolicLink()||info&&!info.isFile())throw new InputError('host-output-error','Output must be a regular file');
  if(info&&!overwrite)throw new InputError('host-output-error','Output exists; use --overwrite explicitly');
  const canonical=info?realpathSync(dest):join(realpathSync(dirname(dest)),basename(dest));
  for(const input of protectedPaths) {
    const actual=realpathSync(input), source=statSync(input);
    if((process.platform==='win32'?actual.toLowerCase()===canonical.toLowerCase():actual===canonical)||info&&source.dev===info.dev&&source.ino===info.ino)
      throw new InputError('host-output-error','Output may not replace an input file');
  }
}
export function atomicOutput(path,text,protectedPaths,overwrite) {
  outputCheck(path,protectedPaths,overwrite);
  const temp=join(dirname(resolve(path)),`.moonmmdb-${randomUUID()}.tmp`);
  let fd;
  try {
    fd=openSync(temp,'wx',0o600);
    const bytes=Buffer.from(text);let at=0;
    while(at<bytes.length){const n=writeSync(fd,bytes,at,bytes.length-at);if(!n)throw new Error('Short output write');at+=n;}
    fsyncSync(fd);closeSync(fd);fd=undefined;
    outputCheck(path,protectedPaths,overwrite);
    if(overwrite)renameSync(temp,path);else {linkSync(temp,path);unlinkSync(temp);}
  } catch(e) {throw new InputError('host-output-error',e.message)}
  finally {if(fd!==undefined)closeSync(fd);try{unlinkSync(temp)}catch(e){if(e.code!=='ENOENT')throw e}}
}
export function verifySource(expected,actual) {
  if(expected.sha256!==undefined&&expected.sha256!==actual.sha256||expected.bytes!==undefined&&expected.bytes!==String(actual.bytes))
    throw new InputError('source-mismatch',`File does not match role ${expected.role}`);
}
async function execute(task,bindings) {
  if(bindings.size!==task.files.length||task.files.some(f=>!bindings.has(f.role)))throw new InputError('invalid-binding','Bind every task role exactly once');
  const files=[],handles=new Map(),p=task.parameters;
  let result;
  if(task.operation==='analyze') {
    const args=['city','asn','input'].map(role=>bindings.get(role));
    for(const [key,value] of Object.entries(p))if(key!=='max_json_depth')args.push('--'+key.replaceAll('_','-'),String(value));
    await analyze(args,async text=>{result=JSON.parse(text)},task.files);
    for(const f of task.files) {
      const source=f.role==='input'?result.input:result.databases[f.role];
      verifySource(f,source);files.push({...f,bytes:String(source.bytes),sha256:source.sha256});
    }
  } else {
    let remaining=268435456;
    const total=[...bindings.values()].reduce((n,path)=>n+statSync(path).size,0);
    if(total>remaining)throw new InputError('file-limit','Combined databases exceed 256 MiB');
    for(const f of task.files) {
      const bytes=readFileBounded(bindings.get(f.role),remaining);remaining-=bytes.length;
      const source={...f,bytes:String(bytes.length),sha256:createHash('sha256').update(bytes).digest('hex')};verifySource(f,source);
      const reader=core.open_database(bytes);checked(core.metadata(reader));handles.set(f.role,reader);files.push(source);
    }
    if(task.operation==='validate')result=JSON.parse(core.validate_database(handles.get('database'),p.decode_data,p.max_work,p.max_state_bytes));
    else {
      const selection=core.prepare_fields(p.fields.length?p.fields:['']);checked(core.selection_status(selection));
      result=JSON.parse(task.operation==='compare'?core.compare_prepared(handles.get('before'),handles.get('after'),p.ip,selection):p.fields.length?core.project_prepared(handles.get('database'),p.ip,selection):core.lookup(handles.get('database'),p.ip));
    }
  }
  if(task.operation==='analyze')task={...task,parameters:result.parameters};
  const report={format:'moonmmdb-report',version:1,tool:{name:'MoonMMDB',version:VERSION},task:{...task,files},finished:new Date().toISOString(),result};
  const json=JSON.stringify(report)+'\n';
  if(Buffer.byteLength(json)>8388608)throw new InputError('report-limit','Full report exceeds 8 MiB');
  checked(workflow.report_check(json));
  const code=result.exit_code??(['error','invalid','incomplete'].includes(result.status)?2:['not_found','changed'].includes(result.status)?1:0);
  return {json,code};
}
export async function runWorkflow(command,args,write) {
  const [document,...flags]=args;if(!document)throw new InputError('host-input-error','Expected task or report file');
  const opt=options(flags),raw=textFile(document,command==='run-task'?65536:8388608);
  const check=checked(command==='run-task'?workflow.task_check(raw):workflow.report_check(raw));
  const protectedPaths=[document,...opt.bindings.values()];
  if(opt.output)outputCheck(opt.output,protectedPaths,opt.overwrite);
  let json,code=0;
  if(command==='verify-report'&&!opt.bindings.size)json=JSON.stringify({status:'checked',level:'internal',recomputed:false,exit_code:0})+'\n';
  else {
    try {
      const actual=await execute(command==='run-task'?check:check.task,opt.bindings);
      if(command==='run-task'){json=actual.json;code=actual.code;}
      else {const comparison=checked(workflow.report_compare(raw,actual.json));json=JSON.stringify(comparison)+'\n';code=comparison.exit_code;}
    } catch(error) {
      if(command!=='verify-report'||error.code!=='source-mismatch')throw error;
      json=JSON.stringify({status:'different',level:'source',recomputed:false,exit_code:1,code:error.code})+'\n';code=1;
    }
  }
  if(opt.output)atomicOutput(opt.output,json,protectedPaths,opt.overwrite);else await write(json);
  return code;
}
