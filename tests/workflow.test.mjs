import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,linkSync,existsSync,statSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import * as policy from '../dist/workflow.mjs';
const root=resolve(import.meta.dirname,'..'),dir=resolve(root,'verification/local/workflow-tests',randomUUID());mkdirSync(dir,{recursive:true});
const native=process.env.MOONMMDB_TEST_NATIVE;
const command=native?[resolve(root,'dist',process.platform==='win32'?'moonmmdb.exe':'moonmmdb')]:[process.execPath,resolve(root,'bin/moonmmdb.mjs')];
const db=name=>resolve(root,'tests/scenarios',name+'.mmdb');
const log=resolve(root,'examples/analysis-access.jsonl');
function cli(args){const r=spawnSync(command[0],[...command.slice(1),...args],{cwd:root,encoding:'utf8',timeout:30000});assert.ifError(r.error);return {...r,json:r.stdout.trim()?JSON.parse(r.stdout):null};}
const task=op=>resolve(root,`examples/tasks/${op}.json`);
const bindings={lookup:['--bind','database',db('asn')],validate:['--bind','database',db('asn')],compare:['--bind','before',db('tags'),'--bind','after',db('tags-updated')],analyze:['--bind','city',db('geo'),'--bind','asn',db('asn'),'--bind','input',log]};
function report(op){const r=cli(['run-task',task(op),...bindings[op]]);assert.ok([0,1].includes(r.status),r.stderr);return r.json;}
const save=(name,value)=>{const p=resolve(dir,name);writeFileSync(p,typeof value==='string'?value:JSON.stringify(value));return p;};

test('four operations produce portable reports with separate internal and recomputed verification',()=>{
  for(const op of Object.keys(bindings)){
    const actual=report(op),path=save(op+'.json',actual);
    assert.equal(actual.task.operation,op);assert.equal(actual.version,1);
    const internal=cli(['verify-report',path]);assert.equal(internal.status,0,internal.stderr);assert.equal(internal.json.level,'internal');assert.equal(internal.json.recomputed,false);
    const full=cli(['verify-report',path,...bindings[op]]);assert.equal(full.status,0,full.stderr);assert.equal(full.json.status,'consistent');assert.equal(full.json.recomputed,true);
  }
});
test('diagnostics retain exact raw line ranges without IP or raw log storage and do not change counts',()=>{
  const rows=['\ufeff{"ip":"192.0.2.1"}\r\n','no-json\n','{}\n','{"ip":5}\n','{"ip":"bad"}\n','{"ip":"203.0.113.1"}'];
  const raw=rows.join(''),input=save('中文 空格 🌕.jsonl',raw);
  const a=cli(['analyze',db('geo'),db('asn'),input]);
  const b=cli(['analyze',db('geo'),db('asn'),input,'--diagnostic-limit','3']);
  assert.equal(b.status,2,b.stderr);assert.equal(b.json.diagnostics.retained,'3');assert.equal(b.json.diagnostics.omitted,'2');
  assert.deepEqual(b.json.diagnostics.rows.map(r=>r.outcome.input),['invalid-jsonl','missing-ip','ip-type-error']);
  let position=Buffer.byteLength(rows[0]);
  for(const [i,row] of b.json.diagnostics.rows.entries()){assert.equal(row.line,String(i+2));assert.equal(row.start,String(position));position+=Buffer.byteLength(rows[i+1]);assert.equal(row.end,String(position));}
  assert.ok(!JSON.stringify(b.json.diagnostics).includes('192.0.2.1'));
  delete b.json.diagnostics;delete b.json.parameters.diagnostic_limit;assert.deepEqual(b.json,a.json);
  assert.equal(b.json.input.sha256,createHash('sha256').update(raw).digest('hex'));
});
test('report validation rejects impossible counters, rankings, provenance, diagnostics, and unknown versions',()=>{
  const good=report('analyze');
  for(const change of [r=>r.result.requests='99',r=>r.result.diagnostics.omitted='1',r=>{r.result.country.group_count='0';r.result.country.top=[];r.result.country.other_requests=r.result.country.counted;},r=>r.result.country.top.reverse(),r=>r.result.country.other_requests='1',r=>r.result.exit_code=0,r=>r.task.files[0].sha256='0'.repeat(64),r=>r.result.diagnostics.rows[0].start='999999',r=>r.version=2,r=>r.task.parameters.command='anything']){
    const bad=structuredClone(good);change(bad);assert.equal(cli(['verify-report',save(randomUUID()+'.json',bad)]).status,2);
  }
  const bare=cli(['analyze',db('geo'),db('asn'),log]).json;
  assert.equal(cli(['verify-report',save('legacy-analyze.json',bare)]).status,0);
});
test('a structurally possible but changed result is not accepted as recomputed truth',()=>{
  const changed=report('lookup');changed.result.fields['/autonomous_system_number'].value.value='999';
  const path=save('modified.json',changed);assert.equal(cli(['verify-report',path]).status,0);
  assert.equal(cli(['verify-report',path,...bindings.lookup]).status,1);
  const different=cli(['verify-report',path,'--bind','database',db('geo')]);assert.equal(different.status,1);assert.equal(different.json.level,'source');
});
test('binding, unknown task fields and invalid task files fail before execution',()=>{
  for(const args of [[],['--bind','database',db('asn'),'--bind','database',db('asn')],['--bind','other',db('asn')]])assert.equal(cli(['run-task',task('lookup'),...args]).status,2);
  const value=JSON.parse(readFileSync(task('lookup')));value.files[0].path=db('asn');assert.equal(cli(['run-task',save('path.json',value),...bindings.lookup]).status,2);
  assert.equal(cli(['run-task',save('oversize.json',' '.repeat(65537)),...bindings.lookup]).status,2);
  assert.equal(cli(['verify-report',save('deep.json','['.repeat(129)+'0'+']'.repeat(129))]).status,2);
});
test('atomic UTF-8 report output refuses overwrites and input aliases',()=>{
  const out=resolve(dir,'输出 🌕.json');let r=cli(['run-task',task('lookup'),...bindings.lookup,'--output',out]);assert.equal(r.status,0,r.stderr);assert.equal(r.stdout,'');assert.equal(JSON.parse(readFileSync(out,'utf8')).version,1);
  r=cli(['run-task',task('lookup'),...bindings.lookup,'--output',out]);assert.equal(r.status,2);
  assert.equal(cli(['run-task',task('lookup'),...bindings.lookup,'--output',out,'--overwrite']).status,0);
  const input=save('source.json',JSON.parse(readFileSync(task('lookup')))),original=readFileSync(input),alias=resolve(dir,'alias.json');linkSync(input,alias);
  for(const path of [input,alias])assert.equal(cli(['run-task',input,...bindings.lookup,'--output',path,'--overwrite']).status,2);
  assert.deepEqual(readFileSync(input),original);
  const absent=resolve(dir,'missing','out.json');assert.equal(cli(['run-task',input,...bindings.lookup,'--output',absent]).status,2);assert.equal(existsSync(absent),false);
});
test('typed payload keys that resemble metadata remain significant',()=>{
  const source=report('lookup');source.task.parameters.fields=[];source.result={status:'found',prefix_length:24,record:{type:'map',value:{finished:{type:'string',value:'A'}}}};
  const other=structuredClone(source);other.result.record.value.finished.value='B';
  const result=JSON.parse(policy.report_compare(JSON.stringify(source),JSON.stringify(other)));assert.equal(result.status,'different');
});

test('100000 rows fill diagnostics without changing totals and replay by sources',()=>{
  const raw='{"ip":"203.0.113.1"}\r\n'.repeat(100000),input=save('scale.jsonl',raw);
  const definition=JSON.parse(readFileSync(task('analyze')));definition.parameters.max_records=100000;definition.parameters.diagnostic_limit=1000;
  const r=cli(['run-task',save('scale-task.json',definition),'--bind','city',db('geo'),'--bind','asn',db('asn'),'--bind','input',input]);
  assert.equal(r.status,1,r.stderr);assert.equal(r.json.result.requests,'100000');assert.equal(r.json.result.diagnostics.retained,'1000');assert.equal(r.json.result.diagnostics.omitted,'99000');assert.equal(r.json.result.diagnostics.rows[0].outcome.issues.length,2);
  const replay=cli(['verify-report',save('scale-report.json',r.json),'--bind','city',db('geo'),'--bind','asn',db('asn'),'--bind','input',input]);assert.equal(replay.status,0,replay.stderr);
});

test('deep valid records cannot produce a report that violates the import depth cap',()=>{
  // Small independent encoder for this single artificial record, not a product writer.
  const field=(type,data,size=data.length)=>Buffer.concat([Buffer.from(type<8?[(type<<5)|size]:[size,type-7]),data]);
  const text=s=>field(2,Buffer.from(s)),number=(type,n)=>field(type,n?Buffer.from([n]):Buffer.alloc(0));
  const map=entries=>field(7,Buffer.concat(entries.flatMap(([k,v])=>[text(k),v])),entries.length);
  let payload=text('leaf');for(let i=0;i<63;i++)payload=map([['child',payload]]);
  const metadata=map([['node_count',number(6,1)],['record_size',number(5,24)],['ip_version',number(5,4)],['database_type',text('Artificial-Depth')],['binary_format_major_version',number(5,2)],['binary_format_minor_version',number(5,0)],['build_epoch',number(9,0)]]);
  const file=resolve(dir,'nested.mmdb');writeFileSync(file,Buffer.concat([Buffer.from([0,0,17,0,0,17]),Buffer.alloc(16),payload,Buffer.from('\xab\xcd\xefMaxMind.com','latin1'),metadata]));
  const value=JSON.parse(readFileSync(task('lookup')));value.parameters={ip:'1.1.1.1',fields:[]};
  const path=save('nested-task.json',value),r=cli(['run-task',path,'--bind','database',file]);
  assert.equal(r.status,2,r.stdout);assert.equal(r.stdout,'');assert.equal(JSON.parse(r.stderr).code,'invalid-workflow');
  value.parameters.fields=['/child'.repeat(63)];
  const projected=cli(['run-task',save('projected-task.json',value),'--bind','database',file]);assert.equal(projected.status,0,projected.stderr);
  assert.equal(projected.json.result.fields[value.parameters.fields[0]].value.value,'leaf');
});

test('bundled anomaly report replays against identical portable sample bytes',()=>{
  const r=cli(['verify-report',resolve(root,'examples/workflow-reports/anomalies.json'),'--bind','city',db('geo'),'--bind','asn',db('asn'),'--bind','input',resolve(root,'examples/workflow-errors.jsonl')]);
  assert.equal(r.status,0,r.stderr);assert.equal(r.json.status,'consistent');
});
