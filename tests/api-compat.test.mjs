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

test('current compiler aliases and prefix derives preserve frozen interfaces',()=>{
 const old='pub fn version() -> String\npub(all) struct Limits {\n max : Int\n} derive(Eq, @debug.Debug)\npub fn json(UInt) -> Json\n';
 const current='import { "moonbitlang/core/json", }\npub fn version() -> String\n#derive(Eq, @debug.Debug)\npub(all) struct Limits {\n max : Int32\n}\npub fn json(UInt32) -> @json.Json\n';
 assert.deepEqual(compareInterfaces(old,current).issues,[]);
 for(const mutated of [current.replace('Int32','Int64'),current.replace('#derive(Eq, @debug.Debug)','#derive(@debug.Debug)'),current.replace('moonbitlang/core/json','other/json')])assert.ok(compareInterfaces(old,mutated).issues.length);
});
test('normalization retains shadowed names, string literals and declaration traits',()=>{
 for(const old of ['pub(all) enum Record {\n Int(Int)\n}\n','pub(all) struct Record {\n Int : Int\n}\n','pub type Json\npub fn get() -> Json\n','pub fn message(text? : String = "Int") -> String\n']) {
   assert.ok(compareInterfaces(old,old.replaceAll('Int','Int32').replaceAll('Json','@json.Json')).issues.length);
 }
 const old='pub(all) enum Result {\n Ok\n} derive(Eq)\npub fn next() -> Result\n';
 assert.ok(compareInterfaces(old,old.replace(' derive(Eq)','')).issues.length);
});
