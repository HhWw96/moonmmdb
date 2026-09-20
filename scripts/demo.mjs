import { spawnSync } from 'node:child_process';
import { root, runMoon } from './moon.mjs';
import { resolve } from 'node:path';
const scenes = [
  ['元数据', ['metadata','tests/fixtures/GeoLite2-ASN-Test.mmdb'], 0],
  ['IPv4/IPv6 查询', ['lookup','tests/fixtures/GeoIP2-City-Test.mmdb','2001:218::','81.2.69.160'], 0],
  ['国家与坐标字段提取', ['project','tests/fixtures/GeoIP2-City-Test.mmdb','2001:218::','/country/iso_code','/location/latitude','/absent'], 0],
  ['日志补充 ASN 字段（含一条未命中）', ['enrich','tests/fixtures/GeoLite2-ASN-Test.mmdb','examples/access.jsonl'], 1],
  ['嵌套 IP 日志字段（含一条未命中）', ['enrich','tests/fixtures/MaxMind-DB-test-ipv4-24.mmdb','examples/nested-access.jsonl','--ip-path','/client/ip','--field','/ip'], 1],
  ['数据库更新检查（等价节点布局）', ['diff','tests/fixtures/MaxMind-DB-test-ipv4-24.mmdb','tests/fixtures/MaxMind-DB-test-ipv4-32.mmdb','examples/database-check.jsonl'], 0],
  ['联合地域、ASN 与内部标签（人工样例）', ['enrich-many','examples/many.json','examples/analysis-access.jsonl'],1],
  ['内部标签更新影响（人工样例）', ['diff','tests/scenarios/tags.mmdb','tests/scenarios/tags-updated.mmdb','examples/analysis-access.jsonl','--field','/site'],1],
];
for (const [title,args,expected] of scenes) {
  console.log('\n'+title);
  const result = spawnSync(process.execPath,['bin/moonmmdb.mjs',...args],{cwd:root,stdio:'inherit'});
  if (result.status !== expected) throw new Error(`Demo exit ${result.status}, expected ${expected}`);
}
console.log('\n独立 MoonBit 消费模块汇总：');
runMoon(['run','.','--target','js'],resolve(root,'examples/log_consumer'));
const analysis=spawnSync(process.execPath,['examples/log_analytics/run.mjs','tests/scenarios/geo.mmdb','tests/scenarios/asn.mmdb','examples/analysis-access.jsonl'],{cwd:root,stdio:'inherit'});
if(analysis.status!==1) throw new Error('Unexpected analytics demo result');
