import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {root} from './moon.mjs';

export const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
export function sourceFingerprint(directory=root) {
  const files=[];
  function walk(relative) {
    const path=resolve(directory,relative);
    if(!existsSync(path)) return;
    for(const item of readdirSync(path,{withFileTypes:true})) {
      if(['_build','target','.mooncakes','node_modules','__pycache__'].includes(item.name)) continue;
      const name=relative+'/'+item.name;
      if(item.isSymbolicLink()) throw new Error('Source fingerprint does not accept symbolic links: '+name);
      if(item.isDirectory()) walk(name);
      else if(!item.name.endsWith('.tmp')) files.push(name);
    }
  }
  for(const dir of ['src','bin','scripts','tests','examples','.github']) walk(dir);
  for(const file of ['moon.mod','package.json','requirements-reference.txt']) if(existsSync(resolve(directory,file))) files.push(file);
  return sha256(files.sort().map(file=>file+'\0'+sha256(readFileSync(resolve(directory,file)))+'\n').join(''));
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify({source_sha256:sourceFingerprint(),core_sha256:sha256(readFileSync(resolve(root,'dist/core.mjs')))}));
}
