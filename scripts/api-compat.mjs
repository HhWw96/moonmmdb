// Conservative public declaration comparison, not a semantic compatibility proof.
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {root,runMoon} from './moon.mjs';
import {sha256} from './evidence.mjs';

export function declarations(text) {
  const clean=text.replace(/\/\/[^\n]*/g,'');
  const starts=[...clean.matchAll(/^pub(?:\([^\n]*?\))?\s+/gm)].map(m=>m.index);
  const result=new Map();
  for(let i=0;i<starts.length;i++) {
    const block=clean.slice(starts[i],starts[i+1]??clean.length).trim().replace(/\s+/g,' ');
    const match=block.match(/^pub(?:\([^)]*\))?\s+(fn|struct|enum|suberror|type|trait)\s+([^\s({=]+)/);
    if(!match)throw new Error('Unrecognized public declaration: '+block.slice(0,100));
    const key=match[1]+' '+match[2];
    if(result.has(key))throw new Error('Duplicate declaration: '+key);
    result.set(key,block);
  }
  if(result.size===0)throw new Error('Empty public interface');
  return result;
}

export function compareInterfaces(before,after) {
  const old=declarations(before),current=declarations(after),issues=[];
  // Removing or retargeting an existing package import can change type identity.
  const imports=text=>[...(text.match(/import\s*\{([\s\S]*?)\}/)?.[1]||'').matchAll(/"[^"]+"(?:\s+@\w+)?/g)].map(m=>m[0].replace(/\s+/g,' '));
  for(const item of imports(before))if(!imports(after).includes(item))issues.push('Changed import: '+item);
  for(const [key,block] of old) {
    if(!current.has(key))issues.push('Removed '+key);
    else if(current.get(key)!==block)issues.push('Changed '+key);
  }
  return {issues,existing:old.size,added:[...current.keys()].filter(k=>!old.has(k))};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const manifest=JSON.parse(readFileSync(resolve(root,'scripts/api-baseline/manifest.json'),'utf8'));
  const paths=[...manifest.files.map(f=>f.current),'src/geo/pkg.generated.mbti'];
  const before=paths.map(p=>readFileSync(resolve(root,p),'utf8'));
  runMoon(['info','--target','js']);
  const report={status:'passed',baseline:manifest.version,scope:'Existing public declarations, imports and checked-in interface freshness. Behavior is covered separately by regression tests.',packages:[]};
  paths.forEach((p,i)=>{if(readFileSync(resolve(root,p),'utf8')!==before[i])throw new Error('Stale generated interface: '+p);});
  for(const file of manifest.files) {
    const baseline=readFileSync(resolve(root,'scripts/api-baseline',file.baseline),'utf8');
    if(sha256(baseline)!==file.sha256)throw new Error('Baseline hash mismatch');
    const result=compareInterfaces(baseline,readFileSync(resolve(root,file.current),'utf8'));
    report.packages.push({path:file.current,...result});
    if(result.issues.length)report.status='failed';
  }
  mkdirSync(resolve(root,'verification/local'),{recursive:true});
  writeFileSync(resolve(root,'verification/local/api-compat.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report));
  if(report.status!=='passed')process.exitCode=1;
}
