import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { root } from '../scripts/moon.mjs';
import { open_database, metadata, lookup } from '../dist/core.mjs';
const inputs = ['MaxMind-DB-test-ipv4-24.mmdb','MaxMind-DB-test-mixed-28.mmdb','MaxMind-DB-test-decoder.mmdb','GeoIP2-City-Test.mmdb'].map(file=>readFileSync(resolve(root,'tests/fixtures',file)));
let state = 0x4d4d4442;
function next() { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return state >>> 0; }
const failures = [];
let rejected = 0;
let opened = 0;
for (let index = 0; index < 2048; index++) {
  const source = inputs[index % inputs.length];
  let data = Buffer.from(source);
  if (index % 3 === 0) data = data.subarray(0,next()%data.length);
  else {
    for (let flip=0;flip<(index%4)+1;flip++) data[next()%data.length] ^= 1 << (next()%8);
  }
  try {
    const handle = open_database(data);
    const info = JSON.parse(metadata(handle));
    if (info.status === 'error') { rejected++; continue; }
    if (info.status !== 'opened') throw new Error('Invalid open status');
    opened++;
    for (const ip of ['1.1.1.3','0.0.0.0','255.255.255.255','2001:218::']) {
      const result = JSON.parse(lookup(handle,ip));
      if (!['found','not_found','error'].includes(result.status)) throw new Error('Invalid query status');
      if (result.status !== 'error' && (!Number.isInteger(result.prefix_length) || result.prefix_length<0 || result.prefix_length>(ip.includes(':')?128:32))) throw new Error('Invalid prefix range');
    }
  } catch (error) { failures.push({index,message:error.message}); }
}
process.stdout.write(JSON.stringify({cases:2048,seed:'0x4d4d4442',opened,rejected,failures,status:failures.length?'failed':'passed'}));
if (failures.length) process.exitCode=1;
