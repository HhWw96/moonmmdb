import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { spawn, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { root } from '../scripts/moon.mjs';
import { boundedLines, streamOptions } from '../bin/jsonl.mjs';
const db = resolve(root, 'tests/fixtures/MaxMind-DB-test-decoder.mmdb');
const cliPath = resolve(root, 'bin/moonmmdb.mjs');
async function collect(source, limits = {}) {
  const result = [];
  for await (const row of boundedLines(source, { ...streamOptions([]), ...limits })) result.push(row);
  return result;
}
function cli(input, args = []) {
  const result = spawnSync(process.execPath, [cliPath, 'enrich', db, '-', ...args], {
    cwd: root, input, encoding: 'utf8', timeout: 20000, maxBuffer: 32 * 1024 * 1024,
  });
  assert.equal(result.error, undefined);
  return { code: result.status, text: result.stdout, rows: result.stdout.trim().split('\n').filter(Boolean).map(JSON.parse) };
}

test('UTF-8 BOM multibyte boundaries CRLF final line and blanks retain line numbers', async () => {
  const input = Buffer.from('\uFEFF{"label":"中🌍"}\r\n\n{"last":true}');
  for (let width = 1; width <= 9; width++) {
    const chunks = [];
    for (let at = 0; at < input.length; at += width) chunks.push(input.subarray(at, at + width));
    const source = Readable.from(chunks);
    assert.deepEqual(await collect(source), [
      { line: 1, text: '{"label":"中🌍"}' }, { line: 2, text: '' }, { line: 3, text: '{"last":true}' },
    ]);
    assert.equal(source.destroyed, true);
  }
  assert.deepEqual(await collect(Readable.from([])), []);
  assert.deepEqual(await collect(Readable.from([Buffer.from('{}\n')])), [{ line: 1, text: '{}' }]);
});

test('byte line record and UTF-8 failures stop the input and report explicit limits', async () => {
  for (const [bytes, limits, code] of [
    [Buffer.from('12345'), { maxBytes: 4 }, 'input-limit'],
    [Buffer.from('12345'), { maxLineBytes: 4 }, 'line-limit'],
    [Buffer.from('a\nb\n'), { maxRecords: 1 }, 'record-limit'],
    [Buffer.from([0x22, 0xe4, 0xb8]), {}, 'invalid-utf8'],
    [Buffer.from([0xff, 0x0a]), {}, 'invalid-utf8'],
  ]) {
    const source = Readable.from([bytes]);
    await assert.rejects(collect(source, limits), error => error.code === code);
    assert.equal(source.destroyed, true);
  }
  assert.deepEqual(await collect(Readable.from([Buffer.from('abcd\n')]), { maxBytes: 5, maxLineBytes: 4, maxRecords: 1 }), [{ line: 1, text: 'abcd' }]);
});

test('nested escaped and array IP paths preserve original number tokens and diagnose missing IP', () => {
  const raw = '{"client":{"a/b":{"~ip":["1.1.1.3"]}},"id":9007199254740993}';
  const result = cli(raw + '\n{}\n', ['--ip-path', '/client/a~1b/~0ip/0', '--field', '/uint128']);
  assert.equal(result.code, 2);
  assert.ok(result.text.includes('"input":' + raw));
  assert.equal(result.rows[0].mmdb.fields['/uint128'].value.value, '1329227995784915872903807060280344576');
  assert.equal(result.rows[1].code, 'invalid-jsonl');
  assert.equal(cli('{"x":["1.1.1.3"]}', ['--ip-path', '/x/00']).code, 2);
  assert.equal(cli('{}', ['--ip-path', '/constructor']).code, 2);
  assert.equal(cli('{"__proto__":{"ip":"1.1.1.3"}}', ['--ip-path', '/__proto__/ip']).code, 0);
});

test('invalid stream configuration fails before empty input and cannot disable limits', () => {
  for (const args of [
    ['--max-records', '0'], ['--max-records', '1000001'], ['--max-records', '1e3'],
    ['--max-line-bytes', '8388609'], ['--max-input-bytes', '1073741825'],
    ['--ip-path', '/bad~2'], ['--ip-path', '/ip', '--ip-path', '/other'], ['--unknown', '1'], ['--field'],
  ]) assert.equal(cli('', args).code, 2, args.join(' '));
  assert.equal(cli('', ['--ip-path', '/ip']).code, 0);
});

test('stdin emits complete rows before EOF and handles a Unicode final row', { timeout: 15000 }, async () => {
  const child = spawn(process.execPath, [cliPath, 'enrich', db, '-', '--field', '/absent'], { cwd: root });
  let stdout = '', stderr = '';
  child.stderr.on('data', data => { stderr += data; });
  child.stdin.on('error', () => {});
  const closed = new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('No output before EOF')), 8000);
      child.stdout.on('data', data => {
        stdout += data;
        if (stdout.includes('\n')) { clearTimeout(timer); resolve(); }
      });
      child.stdin.write('{"ip":"1.1.1.3"}\n');
    });
    assert.equal(child.stdin.writableEnded, false);
    const last = Buffer.from('{"ip":"1.1.1.3","label":"中文🌍"}');
    for (const byte of last) child.stdin.write(Buffer.from([byte]));
    child.stdin.end();
    assert.equal(await closed, 0, stderr);
    assert.equal(stdout.trim().split('\n').length, 2);
    assert.match(stdout, /中文🌍/);
  } finally { if (child.exitCode === null) child.kill(); }
});

test('configured stream handles more than 10000 records and 8 MiB; defaults stay bounded', { timeout: 30000 }, () => {
  const row = JSON.stringify({ ip: '1.1.1.3', padding: 'x'.repeat(800) }) + '\n';
  const input = row.repeat(11000);
  assert.ok(Buffer.byteLength(input) > 8388608);
  const result = cli(input, ['--max-records', '11000', '--max-input-bytes', '12000000', '--field', '/absent']);
  assert.equal(result.code, 0);
  assert.equal(result.rows.length, 11000);
  assert.equal(result.rows.at(-1).line, 11000);
  assert.equal(cli('{"ip":"1.1.1.3"}\n'.repeat(10001), ['--field', '/absent']).rows.at(-1).code, 'record-limit');
  assert.equal(cli('12345', ['--max-input-bytes', '4']).rows.at(-1).code, 'input-limit');
  assert.equal(cli('12345', ['--max-line-bytes', '4']).rows.at(-1).code, 'line-limit');
});
