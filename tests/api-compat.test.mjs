import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compareInterfaces} from '../scripts/api-compat.mjs';
const baseline='import { "example/types" @types, }\npub(all) struct Record {\n field : UInt\n}\npub(all) enum Result {\n Ok(Record)\n Missing\n}\npub fn lookup(String) -> Result raise Error\n';
test('compatible additions preserve all old declarations',()=>{
 assert.deepEqual(compareInterfaces(baseline,baseline+'pub fn project(String) -> Record\n').issues,[]);
 assert.deepEqual(compareInterfaces(baseline,baseline.replace('field : UInt','field   : UInt // comment')).issues,[]);
});
test('guard rejects changed signatures removed functions and exhaustive variants',()=>{
 for(const mutated of [baseline.replace('lookup(String)','lookup(Int)'),baseline.replace(/pub fn lookup[^\n]+/,''),baseline.replace('Missing','Missing\n Failed(String)'),baseline.replace('field : UInt','field : UInt\n other : String'),baseline.replace('example/types','other/types')])assert.ok(compareInterfaces(baseline,mutated).issues.length);
});
