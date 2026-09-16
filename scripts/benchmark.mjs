import { readFileSync,mkdirSync,writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import os from 'node:os';
import { root, runMoon } from './moon.mjs';
import { open_database, metadata, lookup } from '../dist/core.mjs';
const cases = [
  ['GeoLite2-ASN-Test.mmdb',['1.0.0.1','1.128.0.1','255.255.255.255']],
  ['GeoIP2-City-Test.mmdb',['2001:218::','81.2.69.160','255.255.255.255']],
];
const results=[];
for (const [file,ips] of cases) {
  const data=readFileSync(resolve(root,'tests/fixtures',file));
  let reader;
  const openStart=performance.now();
  for(let i=0;i<100;i++) {
    reader=open_database(data);
    if (JSON.parse(metadata(reader)).status!=='opened') throw new Error('Cannot open benchmark fixture');
  }
  const openMs=performance.now()-openStart;
  for(let i=0;i<200;i++) lookup(reader,ips[i%ips.length]);
  const start=performance.now();
  let outputCharacters=0;
  const iterations=10000;
  for(let i=0;i<iterations;i++) outputCharacters+=lookup(reader,ips[i%ips.length]).length;
  const elapsed=performance.now()-start;
  results.push({file,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex'),ips,open_iterations:100,mean_open_and_metadata_ms:openMs/100,warmup:200,query_iterations:iterations,query_elapsed_ms:elapsed,mean_query_us:elapsed*1000/iterations,queries_per_second:iterations*1000/elapsed,output_characters:outputCharacters});
}
const report={timestamp:new Date().toISOString(),node:process.version,platform:process.platform,arch:process.arch,cpu:os.cpus()[0]?.model,toolchain:runMoon(['version','--all'],root,true).trim(),core_sha256:createHash('sha256').update(readFileSync(resolve(root,'dist/core.mjs'))).digest('hex'),scope:'Small official fixtures; hot in-memory lookup includes MoonBit typed JSON serialization. Open includes snapshot copy and metadata serialization. Not a full GeoLite/GeoIP production benchmark; no cross-language speed claim.',rss_end_bytes:process.memoryUsage().rss,max_rss_kib:process.resourceUsage().maxRSS,results};
mkdirSync(resolve(root,'verification/local'),{recursive:true});
writeFileSync(resolve(root,'verification/local/benchmark.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
