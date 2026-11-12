// Conservative public declaration comparison, not a semantic compatibility proof.
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {root,runMoon} from './moon.mjs';
import {sha256} from './evidence.mjs';

// moonc 0.10.20 prints Int32/UInt32, qualified Json and prefix #derive.
// Normalize only these documented aliases; retain members, traits and import identity.
export function declarations(text) {
  const clean=text.replace(/"(?:\\.|[^"\\])*"|\/\/[^\n]*/g,m=>m.startsWith('//')?'':m);
  const starts=[...clean.matchAll(/^(?:#[^\n]*\r?\n)*pub(?:\([^\n]*?\))?\s+/gm)].map(m=>m.index);
  const jsonAlias=[...(clean.match(/import\s*\{([\s\S]*?)\}/)?.[1]||'').matchAll(/"moonbitlang\/core\/json"(?:\s+@(\w+))?/g)].map(m=>m[1]||'json');
  const shadowed=name=>new RegExp('(?:^pub(?:\\([^)]*\\))?\\s+(?:struct|enum|suberror|type|trait)\\s+'+name+'\\b|^\\s*'+name+'\\s*[:(])','m').test(clean);
  const builtin=new Map([['Int','Int32'],['UInt','UInt32'],['Json','$core.json.Json']].filter(([name])=>!shadowed(name)));
  const normalize=block=>block.replace(/"(?:\\.|[^"\\])*"|(?<![\w.@])(?:@\w+\.Json|Int|UInt|Json)\b/g,token=> {
    if(token.startsWith('"'))return token;
    if(jsonAlias.some(alias=>token==='@'+alias+'.Json'))return '$core.json.Json';
    return builtin.get(token)||token;
  }).replace(/\s+/g,' ').trim();
  const result=new Map();
  for(let i=0;i<starts.length;i++) {
    let block=clean.slice(starts[i],starts[i+1]??clean.length).trim();
    const derives=[];
    block=block.replace(/^#derive\(([^\n]*)\)\r?\n/gm,(_,traits)=>{derives.push('derive('+traits+')');return '';});
    if(derives.length)block+=' '+derives.join(' ');
    const match=block.match(/^pub(?:\([^)]*\))?\s+(fn|struct|enum|suberror|type|trait)\s+([^\s({=]+)/);
    if(!match)throw new Error('Unrecognized public declaration: '+block.slice(0,100));
    const key=match[1]+' '+match[2];
    if(result.has(key))throw new Error('Duplicate declaration: '+key);
    result.set(key,normalize(block));
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
