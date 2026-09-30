import {readFileSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {root,runMoon} from './moon.mjs';

export const MOONBIT_VERSION='0.10.14+7d59c7ec9';
export function assertToolchain(output=runMoon(['version','--all'],root,true)) {
  const actual=output.match(/^moonc v([^\s]+)/m)?.[1];
  if(actual!==MOONBIT_VERSION)throw new Error(`Expected pinned moonc ${MOONBIT_VERSION}; found ${actual??'unknown'}`);
  return output;
}
export function checkWorkflowPins() {
  for(const name of readdirSync(resolve(root,'.github/workflows'))) {
    const text=readFileSync(resolve(root,'.github/workflows',name),'utf8');
    for(const pin of text.matchAll(/MOONBIT_INSTALL_VERSION:\s*([^\s]+)/g)) {
      if(pin[1]!==MOONBIT_VERSION)throw new Error('Stale MoonBit workflow pin: '+name);
    }
  }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  checkWorkflowPins();console.log(assertToolchain());
}
