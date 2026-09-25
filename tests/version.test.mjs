import {test} from 'node:test';
import assert from 'node:assert/strict';
import {VERSION,parseVersion,atLeast,capabilities,syncVersions,assertAdvance} from '../scripts/version.mjs';
test('stable numeric version ordering and invalid labels',()=>{
  assert.deepEqual(parseVersion('0.9.1'),[0,9,1]);
  assert.ok(atLeast('0.9.10','0.9.2'));
  assert.ok(!atLeast('0.9.1','0.10.0'));
  assertAdvance('0.9.1','0.9.0');assertAdvance('0.9.10','0.9.9');
  assert.throws(()=>assertAdvance('0.9.0','0.9.0'));assert.throws(()=>assertAdvance('0.9.1','0.9.2'));
  for(const bad of ['v0.9.1','0.9','0.09.1','0.9.1-rc.1','0.9.1+meta','0.9.1\n','1.0.9007199254740992'])assert.throws(()=>parseVersion(bad));
});
test('historical capabilities and patch consumers retain analytics checks',()=>{
  assert.deepEqual(capabilities('0.3.0'),{enrichment:false,geo:false,analytics:false});
  assert.deepEqual(capabilities('0.8.0'),{enrichment:true,geo:true,analytics:false});
  for(const version of ['0.9.0','0.9.1','0.9.10'])assert.deepEqual(capabilities(version),{enrichment:true,geo:true,analytics:true});
  assert.throws(()=>capabilities('0.2.0'));
  assert.deepEqual(syncVersions(),[]);assert.match(VERSION,/^\d+\.\d+\.\d+$/);
});
