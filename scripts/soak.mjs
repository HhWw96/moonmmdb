// Long-lived real-data multi-source queries, bounded measurements, stable outputs.
import {readFileSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import os from 'node:os';
import {root} from './moon.mjs';
import {loadMany} from '../bin/many.mjs';
import {enrich_ip} from '../dist/core.mjs';
const config = process.argv[2];
if (!config) throw new Error('Usage: node scripts/soak.mjs CONFIG [seconds >= 1800]');
const seconds = Number(process.argv[3] || 1800);
if (!Number.isInteger(seconds) || seconds < 1800 || seconds > 7200) throw new Error('Duration must be 1800..7200 seconds');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const coreHash = () => hash(readFileSync(resolve(root,'dist/core.mjs')));
const startedHash = coreHash();
const {handle,provenance} = loadMany(config);
const ips = ['1.1.1.1','8.8.8.8','81.2.69.160','2001:4860:4860::8888','2606:4700:4700::1111','::1','10.0.0.1','255.255.255.255','bad-ip'];
const expected = ips.map(ip=>enrich_ip(handle,ip));
const report={started:new Date().toISOString(),status:'running',seconds,core_sha256:startedHash,databases:provenance,node:process.version,platform:process.platform,cpu:os.cpus()[0]?.model,ips,expected_sha256:expected.map(hash),queries:0,samples:[],scope:'Sustained JS core enrichment plus typed JSON serialization. Output stability against initial values; correctness is independently checked by enrichment-verify.py. Not host pipe or concurrent service load.'};
const path=resolve(root,'verification/local/soak.json');
const begin=performance.now(); let nextSample=0;
try {
  while (performance.now()-begin < seconds*1000) {
    for (let n=0;n<1000;n++) {
      const i=report.queries%ips.length;
      if (enrich_ip(handle,ips[i])!==expected[i]) throw new Error('Result drift for '+ips[i]);
      report.queries++;
    }
    const elapsed=(performance.now()-begin)/1000;
    if(elapsed>=nextSample) {
      report.samples.push({elapsed_seconds:elapsed,queries:report.queries,rss:process.memoryUsage().rss,heap_used:process.memoryUsage().heapUsed});
      writeFileSync(path,JSON.stringify(report,null,2)+'\n');
      console.log(JSON.stringify(report.samples.at(-1)));
      nextSample=elapsed+30;
    }
    await new Promise(r=>setImmediate(r));
  }
  if(coreHash()!==startedHash) throw new Error('Built core changed during soak; rerun required');
  const settled=report.samples.filter(s=>s.elapsed_seconds>=300);
  const median=a=>a.sort((a,b)=>a-b)[Math.floor(a.length/2)];
  const first=median(settled.slice(0,10).map(s=>s.rss));
  const last=median(settled.slice(-10).map(s=>s.rss));
  report.memory={peak_rss:Math.max(...report.samples.map(s=>s.rss)),settled_first_median:first,settled_last_median:last,growth_bytes:last-first,allowed_growth_bytes:Math.max(67108864,first*0.25)};
  if(last-first>report.memory.allowed_growth_bytes) throw new Error('Persistent RSS growth exceeds gate');
  report.status='passed';
} catch(error) {report.status='failed';report.error=error.message;process.exitCode=1;}
report.elapsed_seconds=(performance.now()-begin)/1000; report.queries_per_second=report.queries/report.elapsed_seconds;
report.finished=new Date().toISOString();writeFileSync(path,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,queries:report.queries,elapsed_seconds:report.elapsed_seconds}));
