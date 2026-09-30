import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {assertToolchain,checkWorkflowPins,MOONBIT_VERSION} from '../scripts/toolchain.mjs';
test('compiler pin checks the compiler, including its revision',()=>{
  assert.equal(assertToolchain(`moon 0.1.20260920\nmoonc v${MOONBIT_VERSION} (2026-09-18)\n`),`moon 0.1.20260920\nmoonc v${MOONBIT_VERSION} (2026-09-18)\n`);
  for(const actual of ['0.10.11+6ff76a5f9','0.10.14+other','0.10.15+7d59c7ec9'])assert.throws(()=>assertToolchain(`moonc v${actual}\n`),/Expected pinned moonc/);
  assert.throws(()=>assertToolchain(`moon ${MOONBIT_VERSION}\n`),/found unknown/);
});
test('all compiler-installing workflows match the build pin',()=>checkWorkflowPins());
test('vendored source bytes match provenance and AES differs only by its notice',()=>{
  const base=new URL('../native_cli/vendor/x/',import.meta.url);
  const provenance=JSON.parse(readFileSync(new URL('PROVENANCE.json',base),'utf8'));
  const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
  assert.ok(provenance.files.length>0);
  for(const entry of provenance.files){
    assert.match(entry.path,/^crypto\/[a-z0-9_]+\.mbt$/);
    const bytes=readFileSync(new URL(entry.path,base));
    assert.equal(hash(bytes),entry.local_sha256,entry.path);
    if(entry.path==='crypto/aes.mbt'){
      const body=bytes.toString('utf8').replace(/\/\/\n\/\/ Modified by MoonMMDB contributors:[\s\S]*?source hashes\.\n/,'');
      assert.equal(hash(body),entry.upstream_sha256,'AES algorithm bytes must remain upstream');
    }else assert.equal(hash(bytes),entry.upstream_sha256,entry.path);
  }
});
