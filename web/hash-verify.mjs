import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as hash from '../dist/browser-hash.mjs';
for(const bytes of [Buffer.alloc(0),Buffer.from('abc'),Buffer.from('中文 😀'),Buffer.alloc(65537,0x61),Buffer.alloc(1000000,0x61)]) {
  for(const size of [1,63,64,65,65536]) {
    const session=hash.hash_create();for(let offset=0;offset<bytes.length;offset+=size)hash.hash_update(session,bytes.subarray(offset,offset+size));
    assert.equal(hash.hash_finish(session),createHash('sha256').update(bytes).digest('hex'));
  }
}
console.log('Incremental MoonBit SHA-256: 25 vector/chunk combinations passed');
