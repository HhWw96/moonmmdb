import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as bridge from '../dist/core.mjs';
const city=bridge.open_database(readFileSync(new URL('./scenarios/geo.mmdb',import.meta.url)));
const asn=bridge.open_database(readFileSync(new URL('./scenarios/asn.mmdb',import.meta.url)));
test('existing Reader sessions are independent, finish copies and close is repeatable',()=>{
  const first=bridge.analysis_start(city,asn,10,10000,'/ip'),second=bridge.analysis_start(city,asn,10,10000,'/ip');
  assert.equal(bridge.analysis_error(first),'');assert.equal(bridge.analysis_line(first,'{"ip":"192.0.2.1"}'),'');
  const raw=bridge.analysis_finish(first),report=JSON.parse(raw);report.country.top[0].count='999';
  assert.equal(bridge.analysis_finish(first),raw);assert.equal(JSON.parse(bridge.analysis_finish(second)).requests,'0');
  bridge.analysis_close(first);bridge.analysis_close(first);assert.equal(JSON.parse(bridge.analysis_line(first,'{}')).code,'analyzer-closed');
  bridge.analysis_close(second);assert.equal(JSON.parse(bridge.lookup(city,'192.0.2.1')).status,'found');
});
test('bad Reader and invalid pointer fail before consuming logs',()=>{
  const bad=bridge.open_database(new Uint8Array());
  const first=bridge.analysis_start(bad,asn,10,10000,'/ip');assert.equal(JSON.parse(bridge.analysis_error(first)).code,'missing-metadata');bridge.analysis_close(first);
  const second=bridge.analysis_start(city,asn,10,10000,'bad');assert.equal(JSON.parse(bridge.analysis_error(second)).code,'invalid-path');bridge.analysis_close(second);
});
