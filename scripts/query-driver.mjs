// Batch transport for the independent Python oracle; the query stays in MoonBit.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { root } from './moon.mjs';
import { open_database, metadata, lookup } from '../dist/core.mjs';
const requests = JSON.parse(readFileSync(0, 'utf8'));
const handles = new Map();
const results = [];
for (const request of requests) {
  if (!handles.has(request.file)) handles.set(request.file, open_database(readFileSync(resolve(root, 'tests/fixtures', request.file))));
  const handle = handles.get(request.file);
  results.push(request.operation === 'metadata' ? JSON.parse(metadata(handle)) : JSON.parse(lookup(handle, request.ip)));
}
process.stdout.write(JSON.stringify(results));
