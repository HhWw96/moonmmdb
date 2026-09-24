// Diagnostic only: inspector allocation sampling is excluded from stability gates.
import { Session } from 'node:inspector/promises';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Writable } from 'node:stream';
import { root, runMoon } from './moon.mjs';
import { sha256, sourceFingerprint } from './evidence.mjs';
const dir = resolve(root, 'examples/allocation_probe');
runMoon(['build', '--target', 'js', '--release'], dir);
const path = resolve(dir, '_build/js/release/build/local/moonmmdb_allocation_probe/moonmmdb_allocation_probe.js');
const { probe_open, probe_query, probe_serialize } = await import(pathToFileURL(path));
const db = kind => readFileSync(resolve(root, `verification/local/production/dbip-${kind}-lite-2026-09.mmdb`));
const city = db('city'), country = db('country');
const handle = probe_open(city, country);
const ips = ['1.1.1.1', '8.8.8.8', '81.2.69.160', '2001:4860:4860::8888', '2606:4700:4700::1111', '::1', '10.0.0.1', '255.255.255.255'];
const records = ips.map(ip => probe_query(handle, ip)), texts = records.map(probe_serialize);
const sink = new Writable({ write(_chunk, _encoding, callback) { callback(); } });
const session = new Session(); session.connect();
const report = { status: 'running', node: process.version, platform: process.platform, source_sha256: sourceFingerprint(), probe_sha256: sha256(readFileSync(path)), databases: [city, country].map(sha256), scope: 'Inspector sampled allocation diagnostics, fixed 20000 operations per independent stage; synthetic drained output, not filesystem throughput or formal soak.', stages: [] };
for (const stage of ['query', 'typed_serialization', 'host_parse', 'host_stringify_and_output']) {
  await session.post('HeapProfiler.startSampling', { samplingInterval: 32768, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
  const before = process.memoryUsage(), started = performance.now();
  for (let i = 0; i < 20000; i++) {
    const j = i % ips.length;
    if (stage === 'query') probe_query(handle, ips[j]);
    else if (stage === 'typed_serialization') probe_serialize(records[j]);
    else if (stage === 'host_parse') JSON.parse(texts[j]);
    else await new Promise((resolve, reject) => sink.write(JSON.stringify(JSON.parse(texts[j])) + '\n', e => e ? reject(e) : resolve()));
  }
  const elapsed_ms = performance.now() - started, after = process.memoryUsage();
  const { profile } = await session.post('HeapProfiler.stopSampling');
  const sites = [];
  function walk(n, stack = []) {
    const name = n.callFrame.functionName || n.callFrame.url || '(anonymous)';
    const trace = [...stack, name];
    if (n.selfSize) sites.push({ bytes: n.selfSize, stack: trace.slice(-6) });
    for (const child of n.children ?? []) walk(child, trace);
  }
  walk(profile.head);
  report.stages.push({ stage, operations: 20000, elapsed_ms, before, after, sampled_bytes: sites.reduce((n, s) => n + s.bytes, 0), largest_sites: sites.sort((a, b) => b.bytes - a.bytes).slice(0, 15) });
}
session.disconnect(); sink.end(); report.status = 'passed';
const label = process.argv[2] ?? 'before'; if (!/^[a-z0-9-]+$/.test(label)) throw new Error('Invalid label');
mkdirSync(resolve(root, 'verification/local'), { recursive: true });
writeFileSync(resolve(root, `verification/local/allocation-${label}.json`), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report.stages.map(({stage, elapsed_ms, sampled_bytes, largest_sites}) => ({stage, elapsed_ms, sampled_bytes, largest_sites: largest_sites.slice(0, 3)}))));
