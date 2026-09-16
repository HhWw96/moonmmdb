import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {join,resolve,relative} from 'node:path';
import {tmpdir} from 'node:os';
import {sourceFingerprint} from '../scripts/evidence.mjs';
test('release fingerprint changes with source or fixture edits but ignores generated build output',()=>{
  const parent=resolve(tmpdir());
  const temp=mkdtempSync(join(parent,'moonmmdb-fingerprint-'));
  try {
    for(const dir of ['src','tests','examples/_build']) mkdirSync(join(temp,dir),{recursive:true});
    writeFileSync(join(temp,'src/reader.mbt'),'source A');
    writeFileSync(join(temp,'tests/sample.mmdb'),Buffer.from([1,2,3]));
    const baseline=sourceFingerprint(temp);
    writeFileSync(join(temp,'examples/_build/output.js'),'ignored artifact');
    assert.equal(sourceFingerprint(temp),baseline);
    writeFileSync(join(temp,'tests/sample.mmdb'),Buffer.from([1,2,4]));
    assert.notEqual(sourceFingerprint(temp),baseline);
    writeFileSync(join(temp,'tests/sample.mmdb'),Buffer.from([1,2,3]));
    writeFileSync(join(temp,'src/reader.mbt'),'source B');
    assert.notEqual(sourceFingerprint(temp),baseline);
  } finally {
    if(!relative(parent,resolve(temp)).startsWith('moonmmdb-fingerprint-')) throw new Error('Unexpected cleanup target');
    rmSync(temp,{recursive:true,force:true});
  }
});
