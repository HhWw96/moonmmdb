// Process-isolated transport; all decoding stays in the MoonBit library.
import {readFileSync} from 'node:fs';
import {open_database, metadata, lookup} from '../dist/core.mjs';
const request=JSON.parse(readFileSync(0,'utf8'));
const handle=open_database(readFileSync(request.file));
const opened=JSON.parse(metadata(handle));
const queries=opened.status==='opened'?request.ips.map(ip=>JSON.parse(lookup(handle,ip))):[];
if(request.policy) {
  for(const result of queries) delete result.record;
  if(opened.status==='opened')delete opened.metadata;
}
process.stdout.write(JSON.stringify({opened,queries}));
