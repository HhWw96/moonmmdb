import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, copyFileSync, openSync, ftruncateSync, closeSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { root } from '../scripts/moon.mjs';
const host = process.env.MOONMMDB_TEST_NATIVE ? [resolve(root, 'dist', process.platform === 'win32' ? 'moonmmdb.exe' : 'moonmmdb')] : [process.execPath, resolve(root, 'bin/moonmmdb.mjs')];
const city = resolve(root, 'tests/scenarios/geo.mmdb'), asn = resolve(root, 'tests/scenarios/asn.mmdb');
const row = ip => JSON.stringify({ ip }) + '\n';
function run(input, flags = [], db = [city, asn], path = '-') {
  const r = spawnSync(host[0], [...host.slice(1), 'analyze', ...db, path, ...flags], { cwd: root, input, encoding: 'utf8', timeout: 45000, maxBuffer: 2**22 });
  assert.equal(r.error, undefined);
  return { ...r, report: r.stdout ? JSON.parse(r.stdout) : undefined };
}
function failed(input, flags, code, db) {
  const r = run(input, flags, db);
  assert.equal(r.status, 2, r.stderr);
  assert.equal(r.stdout, '', 'fatal input must not produce a complete report');
  assert.equal(JSON.parse(r.stderr).code, code);
}

test('counts requests independently and preserves raw BOM CRLF and large number bytes', () => {
  const input = '\uFEFF{"ip":"192.0.2.1","id":9007199254740993}\r\n' + row('192.0.2.1') + row('198.51.100.1') + row('203.0.113.1') + '{"ip":"bad"}\n{}\n\n{"ip":"2001:db8::1"}';
  const r = run(input, ['--top', '1']);
  assert.equal(r.status, 2, r.stderr);
  const p = r.report;
  assert.equal(p.requests, '8'); assert.equal(p.valid_ips, '5'); assert.equal(p.invalid_inputs, '3');
  for (const d of [p.country, p.asn]) {
    assert.equal(d.counted, '3'); assert.equal(d.not_found, '1'); assert.equal(d.missing_field, '0');
    assert.equal(d.query_error, '1'); // IPv6 against this deliberately IPv4-only sample.
    assert.equal(d.group_count, '2'); assert.equal(d.other_requests, '1');
    assert.equal(['counted', 'not_found', 'missing_field', 'type_error', 'query_error'].reduce((n, k) => n + BigInt(d[k]), 0n), BigInt(p.valid_ips));
  }
  assert.deepEqual(p.country.top, [{ key: 'ZZ', count: '2' }]);
  assert.deepEqual(p.input, { bytes: String(Buffer.byteLength(input)), sha256: createHash('sha256').update(input).digest('hex') });
  assert.equal(r.stderr, '');
});

test('empty input, ties, missing fields and exit precedence', () => {
  assert.equal(run('').report.requests, '0');
  const r = run(row('192.0.2.1') + row('198.51.100.1'));
  assert.equal(r.status, 0); assert.equal(r.report.country.top[0].key, 'YY');
  const missing = run(row('192.0.2.1'), [], [asn, city]);
  assert.equal(missing.status, 0); assert.equal(missing.report.country.missing_field, '1');
  assert.equal(run(row('203.0.113.1')).status, 1);
  assert.equal(run(row('203.0.113.1') + '{}').status, 2);
});

test('nested escaped IP paths and excessive JSON depth', () => {
  const input = '{"a/b":{"~x":["192.0.2.1"]},"n":1e300}';
  assert.equal(run(input, ['--ip-path', '/a~1b/~0x/0']).status, 0);
  assert.equal(run(input, ['--ip-path', '/a~1b/~0x/00']).report.invalid_inputs, '1');
  const deep = '{"ip":"192.0.2.1","deep":' + '['.repeat(129) + '0' + ']'.repeat(129) + '}';
  assert.equal(run(deep).report.invalid_inputs, '1');
});

test('fatal UTF8, resource limits and invalid parameters produce diagnostics only', () => {
  failed(Buffer.from([255]), [], 'invalid-utf8');
  failed(row('192.0.2.1') + row('198.51.100.1'), ['--max-groups', '1'], 'group-limit');
  failed('{}\n{}', ['--max-records', '1'], 'record-limit');
  failed('12345', ['--max-line-bytes', '4'], 'line-limit');
  failed('12345', ['--max-input-bytes', '4'], 'input-limit');
  for (const flags of [['--top', '0'], ['--top', '101'], ['--max-groups', '10001'], ['--max-groups', '1e3'], ['--top', '2', '--top', '3'], ['--field', '/country'], ['--top']]) {
    assert.equal(run('', flags).status, 2);
  }
  assert.equal(run('1234\n', ['--max-line-bytes', '4', '--max-input-bytes', '5']).report.invalid_inputs, '1');
});

test('bad configuration does not wait for standard input', { timeout: 10000 }, async () => {
  const child = spawn(host[0], [...host.slice(1), 'analyze', city, asn, '-', '--top', '101'], { cwd: root });
  let out = '', err = ''; child.stdout.on('data', b => out += b); child.stderr.on('data', b => err += b);
  child.stdin.on('error', () => {});
  const timer = setTimeout(() => child.kill(), 5000);
  try { const code = await new Promise(resolve => child.once('close', resolve)); assert.equal(code, 2, err); assert.equal(out, ''); }
  finally { clearTimeout(timer); child.stdin.destroy(); }
});

test('record budgets are fatal while ordinary source corruption remains countable', () => {
  const dir=resolve(root,'verification/local/analytics-record-limit');mkdirSync(dir,{recursive:true});
  const data=readFileSync(asn), offset=data.indexOf(Buffer.from('autonomous_system_number'))-2;
  assert.ok(offset>=0);assert.equal(data[offset],0xe1);assert.equal(data[offset+1],0x58);
  const path=resolve(dir,'record-limit.mmdb');
  // An array declaring 65821 elements exceeds the 65536-value decode budget.
  const limited=Buffer.from(data);limited.set([0x1f,0x04,0,0,0],offset);writeFileSync(path,limited);
  failed(row('192.0.2.1'),[],'value-limit',[path,asn]);
  // A reserved scalar type is a per-source query error, not budget exhaustion.
  const broken=Buffer.from(data);broken.set([0,5],offset);writeFileSync(path,broken);
  const result=run(row('192.0.2.1'),[],[path,asn]);
  assert.equal(result.status,2);assert.equal(result.report.status,'complete');
  assert.equal(result.report.country.query_error,'1');assert.equal(result.report.asn.counted,'1');
  unlinkSync(path);
});

test('individual and combined database limits fail before stdin', () => {
  const dir=resolve(root,'verification/local/analytics-limit');mkdirSync(dir,{recursive:true});
  const path=resolve(dir,'oversized.mmdb');const fd=openSync(path,'w');
  try {
    ftruncateSync(fd,268435457);failed('',[],'file-limit',[path,asn]);
    ftruncateSync(fd,268435456);failed('',[],'file-limit',[city,path]);
  } finally { closeSync(fd);unlinkSync(path); }
});

test('100000 rows are counted without retaining rows', { timeout: 60000 }, () => {
  const input = row('192.0.2.1').repeat(99999) + '{}\n';
  const r = run(input, ['--max-records', '100000']);
  assert.equal(r.status, 2, r.stderr); assert.equal(r.report.requests, '100000');
  assert.equal(r.report.country.top[0].count, '99999'); assert.equal(r.report.invalid_inputs, '1');
});

test('Unicode database and input paths and read failure', () => {
  const dir = resolve(root, 'verification/local/analytics 中文 🌍'); mkdirSync(dir, { recursive: true });
  const db = resolve(dir, '国家.mmdb'), input = resolve(dir, '日志.jsonl');
  copyFileSync(city, db); writeFileSync(input, row('192.0.2.1'));
  assert.equal(run('', [], [db, asn], input).status, 0);
  const bad = run('', [], [db, asn], dir); assert.equal(bad.status, 2); assert.equal(bad.stdout, '');
});

test('slow input yields no report before EOF and raw hashing spans individual bytes', { timeout: 15000 }, async () => {
  const child = spawn(host[0], [...host.slice(1), 'analyze', city, asn, '-'], { cwd: root });
  let out = '', err = ''; child.stdout.on('data', b => out += b); child.stderr.on('data', b => err += b);
  child.stdin.on('error', () => {});
  const done = new Promise(resolve => child.once('close', resolve));
  const input = Buffer.from('\uFEFF{"ip":"192.0.2.1","text":"中文🌍"}\r\n');
  for (const byte of input) { child.stdin.write(Buffer.from([byte])); await new Promise(r => setTimeout(r, 2)); }
  assert.equal(out, ''); child.stdin.end(); assert.equal(await done, 0, err);
  assert.equal(JSON.parse(out).input.sha256, createHash('sha256').update(input).digest('hex'));
});

test('closed output does not claim completion', { timeout: 15000 }, async () => {
  const child = spawn(host[0], [...host.slice(1), 'analyze', city, asn, '-'], { cwd: root });
  let err = ''; child.stderr.on('data', b => err += b); child.stdin.on('error', () => {});
  const done = new Promise(resolve => child.once('close', resolve));
  child.stdout.destroy(); child.stdin.end(row('192.0.2.1'));
  assert.equal(await done, 2, err); assert.equal(JSON.parse(err).code, 'host-output-error');
});
