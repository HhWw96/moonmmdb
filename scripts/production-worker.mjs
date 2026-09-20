// Equivalent transport for the JS and Native production-corpus comparison.
import {readFileSync} from 'node:fs';
import {open_database,metadata,lookup,prepare_fields,project_prepared} from '../dist/core.mjs';
const bytes=readFileSync(process.argv[2]);
const ips=readFileSync(process.argv[3],'utf8').split(/\r?\n/).filter(Boolean);
const start=performance.now();
const reader=open_database(bytes);
const opened=JSON.parse(metadata(reader));
opened.open_ms=performance.now()-start;
async function emit(value) {await new Promise((resolve,reject)=>process.stdout.write(JSON.stringify(value)+'\n',error=>error?reject(error):resolve()));}
await emit(opened);
if(opened.status!=='opened') process.exitCode=2;
else {
  const paths=['/country/iso_code','/country/names/zh-CN','/city/names/en','/location/latitude','/autonomous_system_number','/autonomous_system_organization','/absent'];
  const queryStart=performance.now();
  const selector=prepare_fields(paths);
  for(const ip of ips) await emit({ip,lookup:JSON.parse(lookup(reader,ip)),projection:JSON.parse(project_prepared(reader,ip,selector))});
  await emit({status:'complete',queries:ips.length,elapsed_ms:performance.now()-queryStart,rss_bytes:process.memoryUsage().rss});
}
