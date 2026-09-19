import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { open_database, prepare_fields, selection_status, project_prepared } from '../dist/core.mjs';
const reader = () => open_database(readFileSync(new URL('./fixtures/MaxMind-DB-test-decoder.mmdb', import.meta.url)));

test('opaque prepared handle snapshots host arrays and survives host result mutation', () => {
  const paths = ['/uint128', '/absent'];
  const selection = prepare_fields(paths);
  paths[0] = '/wrong';
  assert.equal(JSON.parse(selection_status(selection)).status, 'valid');
  const db = reader();
  const first = JSON.parse(project_prepared(db, '1.1.1.3', selection));
  assert.equal(first.fields['/uint128'].value.value, '1329227995784915872903807060280344576');
  first.fields['/uint128'] = null;
  assert.equal(JSON.parse(project_prepared(db, '1.1.1.3', selection)).fields['/uint128'].status, 'present');
});

test('failed configuration and database handles keep structured errors', () => {
  const bad = prepare_fields(['/bad~2']);
  assert.equal(JSON.parse(selection_status(bad)).code, 'invalid-path');
  assert.equal(JSON.parse(project_prepared(reader(), '1.1.1.3', bad)).code, 'invalid-path');
  const good = prepare_fields(['/absent']);
  assert.equal(JSON.parse(project_prepared(open_database(new Uint8Array()), '1.1.1.3', good)).code, 'missing-metadata');
  assert.equal(JSON.parse(project_prepared(reader(), 'bad-ip', good)).code, 'invalid-ip');
});
