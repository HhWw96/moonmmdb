import { spawnSync } from 'node:child_process';
import { root, runMoon } from './moon.mjs';
import { resolve } from 'node:path';
const scenes = [
  ['元数据', ['metadata','tests/fixtures/GeoLite2-ASN-Test.mmdb'], 0],
  ['IPv4/IPv6 查询', ['lookup','tests/fixtures/GeoIP2-City-Test.mmdb','2001:218::','81.2.69.160'], 0],
  ['国家与坐标字段提取', ['project','tests/fixtures/GeoIP2-City-Test.mmdb','2001:218::','/country/iso_code','/location/latitude','/absent'], 0],
  ['日志补充 ASN 字段（含一条未命中）', ['enrich','tests/fixtures/GeoLite2-ASN-Test.mmdb','examples/access.jsonl'], 1],
];
for (const [title,args,expected] of scenes) {
  console.log('\n'+title);
  const result = spawnSync(process.execPath,['bin/moonmmdb.mjs',...args],{cwd:root,stdio:'inherit'});
  if (result.status !== expected) throw new Error(`Demo exit ${result.status}, expected ${expected}`);
}
console.log('\n独立 MoonBit 消费模块汇总：');
runMoon(['run','.','--target','js'],resolve(root,'examples/log_consumer'));
