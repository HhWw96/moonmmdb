import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { root } from '../scripts/moon.mjs';
import { open_database, prepare_fields, compare_prepared } from '../dist/core.mjs';
const fixture = name => resolve(root, 'tests/fixtures', name);
const before = fixture('MaxMind-DB-test-ipv4-24.mmdb');
function cli(after, input, options = []) {
  const result = spawnSync(process.execPath, [resolve(root, 'bin/moonmmdb.mjs'), 'diff', before, after, '-', ...options], {
    cwd: root, input, encoding: 'utf8', timeout: 10000, maxBuffer: 4 * 1024 * 1024,
  });
  assert.equal(result.error, undefined);
  return { code: result.status, text: result.stdout,
    rows: result.stdout.trim().split('\n').filter(Boolean).map(JSON.parse),
    summary: result.stderr.trim() ? JSON.parse(result.stderr) : null };
}

test('different node layouts compare equal including a miss and report complete counts', () => {
  const result = cli(fixture('MaxMind-DB-test-ipv4-32.mmdb'), '{"ip":"1.1.1.1"}\n{"ip":"1.1.1.3"}\n{"ip":"255.255.255.255"}\n');
  assert.equal(result.code, 0);
  assert.deepEqual(result.rows.map(row => row.diff.status), ['unchanged', 'unchanged', 'unchanged']);
  assert.deepEqual(result.summary, { status: 'summary', processed: 3, changed: 0, unchanged: 3, errors: 0 });
  assert.equal(cli(before, '').summary.processed, 0);
});

test('database update exposes old/new field values and keeps original input precision', () => {
  const directory = mkdtempSync(join(tmpdir(), 'moonmmdb-diff-'));
  try {
    const bytes = Buffer.from(readFileSync(before));
    const offset = bytes.indexOf(Buffer.from('1.1.1.2'));
    assert.ok(offset > 0);
    bytes[offset] = 57;
    const after = join(directory, 'updated.mmdb');
    writeFileSync(after, bytes);
    const raw = '{"client":{"ip":"1.1.1.3"},"id":9007199254740993}';
    const result = cli(after, raw + '\n', ['--ip-path', '/client/ip', '--field', '/ip']);
    assert.equal(result.code, 1);
    assert.ok(result.text.includes('"input":' + raw));
    const diff = result.rows[0].diff;
    assert.deepEqual(diff.changed_fields, ['/ip']);
    assert.equal(diff.before.fields['/ip'].value.value, '1.1.1.2');
    assert.equal(diff.after.fields['/ip'].value.value, '9.1.1.2');
    assert.equal(diff.record_changed, false);
    assert.equal(diff.prefix_changed, false);
    assert.equal(result.summary.changed, 1);
    assert.equal(cli(after, '{"ip":"1.1.1.3"}', ['--field', '/absent']).code, 0);
    assert.deepEqual(cli(after, '{"ip":"1.1.1.3"}').rows[0].diff.changed_fields, ['']);
  } finally {
    assert.ok(resolve(directory).startsWith(resolve(tmpdir(), 'moonmmdb-diff-')));
    rmSync(directory, { recursive: true, force: true });
  }
});

test('record removals are changes; bad input takes precedence and is included in counts', () => {
  const result = cli(fixture('MaxMind-DB-test-ipv6-24.mmdb'), '{"ip":"1.1.1.1"}\nnot-json\n{"ip":"bad"}\n', ['--field', '/absent']);
  assert.equal(result.code, 2);
  assert.equal(result.rows[0].diff.record_changed, true);
  assert.equal(result.rows[0].diff.status, 'changed');
  assert.equal(result.rows[1].code, 'invalid-jsonl');
  assert.equal(result.rows[2].diff.code, 'invalid-ip');
  assert.deepEqual(result.summary, { status: 'summary', processed: 3, changed: 1, unchanged: 0, errors: 2 });
});

test('invalid database selector and input limits cannot produce a successful summary', () => {
  assert.equal(cli(before, '', ['--field', '/invalid~2']).code, 2);
  const missing = cli(fixture('missing.mmdb'), '');
  assert.equal(missing.code, 2);
  assert.equal(missing.summary, null);
  const limited = cli(before, '{"ip":"1.1.1.1"}\n', ['--max-line-bytes', '3']);
  assert.equal(limited.rows.at(-1).code, 'line-limit');
  assert.equal(limited.summary, null);
  const handle = open_database(readFileSync(before));
  const invalid = open_database(new Uint8Array());
  const selector = prepare_fields(['/ip']);
  assert.equal(JSON.parse(compare_prepared(handle, invalid, '1.1.1.1', selector)).code, 'missing-metadata');
  assert.equal(JSON.parse(compare_prepared(invalid, handle, '1.1.1.1', selector)).code, 'missing-metadata');
});
