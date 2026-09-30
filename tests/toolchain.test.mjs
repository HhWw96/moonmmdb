import test from 'node:test';
import assert from 'node:assert/strict';
import {assertToolchain,checkWorkflowPins,MOONBIT_VERSION} from '../scripts/toolchain.mjs';
test('compiler pin checks the compiler, including its revision',()=>{
  assert.equal(assertToolchain(`moon 0.1.20260920\nmoonc v${MOONBIT_VERSION} (2026-09-18)\n`),`moon 0.1.20260920\nmoonc v${MOONBIT_VERSION} (2026-09-18)\n`);
  for(const actual of ['0.10.11+6ff76a5f9','0.10.14+other','0.10.15+7d59c7ec9'])assert.throws(()=>assertToolchain(`moonc v${actual}\n`),/Expected pinned moonc/);
  assert.throws(()=>assertToolchain(`moon ${MOONBIT_VERSION}\n`),/found unknown/);
});
test('all compiler-installing workflows match the build pin',()=>checkWorkflowPins());
