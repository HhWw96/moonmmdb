import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { spawnSync, spawn } from 'node:child_process';
import { root } from '../scripts/moon.mjs';
import { open_database, lookup, metadata } from '../dist/core.mjs';
const fixtures = resolve(root, 'tests/fixtures');
const fixture = name => join(fixtures, name);
const db = fixture('MaxMind-DB-test-decoder.mmdb');

function cli(args) {
  const result = spawnSync(process.execPath, [resolve(root, 'bin/moonmmdb.mjs'), ...args], {cwd: root, encoding:'utf8', timeout:10000, maxBuffer:4*1024*1024});
  assert.equal(result.error, undefined);
  return {code:result.status, stderr:result.stderr, text:result.stdout, rows: result.stdout.trim() ? result.stdout.trim().split('\n').map(s => {try{return JSON.parse(s);}catch{return s;}}) : []};
}

test('help and version require no database or network', () => {
  assert.match(cli(['--help']).text, /offline MaxMind DB/);
  assert.equal(cli(['--version']).text.trim(), '0.5.0');
  assert.equal(cli([]).code, 2);
});

test('open metadata and preserve exact rich query values', () => {
  assert.equal(cli(['metadata', db]).rows[0].status, 'opened');
  const result = cli(['lookup', db, '1.1.1.3']);
  assert.equal(result.code, 0);
  assert.equal(result.rows[0].record.value.uint128.value, '1329227995784915872903807060280344576');
  assert.equal(result.rows[0].record.value.bytes.value, '0000002a');
});

test('multiple queries distinguish misses and errors with error precedence', () => {
  const path = fixture('MaxMind-DB-test-ipv4-24.mmdb');
  assert.equal(cli(['lookup', path, '255.255.255.255']).code, 1);
  const result = cli(['lookup', path, '1.1.1.1', '255.255.255.255', 'bad-ip']);
  assert.equal(result.code, 2);
  assert.deepEqual(result.rows.map(r => r.status), ['found','not_found','error']);
  assert.equal(result.rows[2].code, 'invalid-ip');
});

test('field projection supports real country and coordinate paths without hiding missing fields', () => {
  const result = cli(['project',fixture('GeoIP2-City-Test.mmdb'),'2001:218::','/country/iso_code','/location/latitude','/absent']);
  assert.equal(result.code,0);
  assert.equal(result.rows[0].fields['/country/iso_code'].value.value,'JP');
  assert.equal(result.rows[0].fields['/location/latitude'].value.type,'float64');
  assert.equal(result.rows[0].fields['/absent'].status,'missing');
  assert.equal(cli(['project',db,'1.1.1.3','/bad~2']).rows[0].code,'invalid-path');
  assert.equal(cli(['project',fixture('MaxMind-DB-test-ipv4-24.mmdb'),'255.255.255.255','/ip']).code,1);
});

test('enrichment can select only ASN fields while preserving a missing-field status', () => {
  const result = cli(['enrich',fixture('GeoLite2-ASN-Test.mmdb'),'examples/access.jsonl','--field','/autonomous_system_number','--field','/absent']);
  assert.equal(result.code,1);
  assert.equal(result.rows[0].mmdb.fields['/autonomous_system_number'].value.value,'15169');
  assert.equal(result.rows[0].mmdb.fields['/absent'].status,'missing');
  assert.equal(result.rows[0].mmdb.record,undefined);
});

test('invalid enrichment field configuration fails even with an empty input file', () => {
  const temp=mkdtempSync(join(tmpdir(),'moonmmdb-empty-'));
  try {
    const file=join(temp,'empty.jsonl');
    writeFileSync(file,'');
    assert.equal(cli(['enrich',db,file]).code,0);
    const result=cli(['enrich',db,file,'--field','/bad~2']);
    assert.equal(result.code,2);
    assert.equal(result.rows[0].code,'invalid-path');
  } finally {rmSync(temp,{recursive:true,force:true});}
});

test('opening snapshots mutable host bytes and independent handles remain valid', () => {
  const bytes = readFileSync(db);
  const first = open_database(bytes);
  const other = open_database(readFileSync(fixture('MaxMind-DB-test-ipv4-28.mmdb')));
  bytes.fill(0);
  assert.equal(JSON.parse(lookup(first, '1.1.1.3')).record.value.uint128.type, 'uint128');
  assert.equal(JSON.parse(lookup(other, '1.1.1.3')).prefix_length, 31);
  assert.equal(JSON.parse(metadata(first)).status, 'opened');
});

test('host input failures and paths containing Unicode are explicit', () => {
  const temp = mkdtempSync(join(tmpdir(), 'moonmmdb-test-'));
  try {
    const path = join(temp, '示例 数据库.mmdb');
    writeFileSync(path, readFileSync(db));
    assert.equal(cli(['lookup', path, '1.1.1.3']).code, 0);
    assert.equal(cli(['metadata', join(temp, 'missing.mmdb')]).code, 2);
    assert.equal(cli(['metadata', temp]).code, 2);
    writeFileSync(path, Buffer.from('not a database'));
    assert.equal(cli(['metadata', path]).rows[0].code, 'missing-metadata');
  } finally { rmSync(temp, {recursive:true, force:true}); }
});

test('JSONL enrichment preserves input, diagnoses each bad line and keeps errors', () => {
  const temp = mkdtempSync(join(tmpdir(), 'moonmmdb-enrich-'));
  try {
    const path = join(temp, 'access.jsonl');
    writeFileSync(path, '{"ip":"1.1.1.3","path":"/home"}\nnot json\n{"ip":"bad"}\n');
    const result = cli(['enrich', db, path]);
    assert.equal(result.code, 2);
    assert.equal(result.rows.length, 3);
    assert.equal(result.rows[0].input.path, '/home');
    assert.equal(result.rows[0].mmdb.status, 'found');
    assert.equal(result.rows[1].line, 2);
    assert.equal(result.rows[1].code, 'invalid-jsonl');
    assert.equal(result.rows[2].mmdb.code, 'invalid-ip');
    writeFileSync(path, Buffer.from([0xff]));
    assert.equal(cli(['enrich', db, path]).code, 2);
  } finally { rmSync(temp, {recursive:true, force:true}); }
});

test('JSONL retains original integer exponent negative-zero and escaped-string tokens', () => {
  const temp = mkdtempSync(join(tmpdir(), 'moonmmdb-exact-'));
  try {
    const path = join(temp, 'exact.jsonl');
    const original = '{"ip":"1.1.1.3","id":9007199254740993,"huge":1e400,"zero":-0,"nested":{"n":18446744073709551615},"escaped":"\\u4e2d"}';
    writeFileSync(path, original + '\r\n');
    const result = cli(['enrich', db, path]);
    assert.equal(result.code, 0);
    assert.ok(result.text.includes('"input":' + original + ',"mmdb":'));
  } finally { rmSync(temp, {recursive:true, force:true}); }
});

test('slow output consumer receives every row and a closed pipe reports an output error', {timeout:20000}, async () => {
  const temp = mkdtempSync(join(tmpdir(), 'moonmmdb-stream-'));
  try {
    const path = join(temp, 'bulk.jsonl');
    writeFileSync(path, ('{"ip":"1.1.1.3","padding":"' + 'x'.repeat(4096) + '"}\n').repeat(1000));
    for (const closeEarly of [false, true]) {
      const child = spawn(process.execPath, [resolve(root,'bin/moonmmdb.mjs'),'enrich',db,path], {cwd:root});
      let stdout = '', stderr = '';
      child.stderr.setEncoding('utf8').on('data', data => {stderr += data;});
      child.stdout.setEncoding('utf8');
      child.stdout.pause();
      const resumed = setTimeout(() => child.stdout.resume(), 100);
      child.stdout.on('data', data => {
        if (closeEarly) child.stdout.destroy();
        else stdout += data;
      });
      const code = await new Promise((resolve, reject) => {child.on('error',reject); child.on('close',resolve);});
      clearTimeout(resumed);
      assert.equal(code, closeEarly ? 2 : 0, stderr);
      if (closeEarly) assert.equal(JSON.parse(stderr).code,'host-output-error');
      else assert.equal(stdout.trim().split('\n').length,1000);
    }
  } finally { rmSync(temp, {recursive:true, force:true}); }
});
