#!/usr/bin/env node
// Host I/O only. MMDB parsing, traversal, typed results and diagnostics are MoonBit.
import { openSync, fstatSync, readSync, closeSync } from 'node:fs';
import { open_database, metadata, lookup } from '../dist/core.mjs';

const help = `MoonMMDB 0.1.0 — offline MaxMind DB reader
Usage:
  node bin/moonmmdb.mjs metadata DATABASE.mmdb
  node bin/moonmmdb.mjs lookup DATABASE.mmdb IP [IP ...]
  node bin/moonmmdb.mjs enrich DATABASE.mmdb INPUT.jsonl
  node bin/moonmmdb.mjs --help | --version

enrich expects one JSON object per line with an "ip" string; output keeps the
input under "input" and puts the lookup under "mmdb". Maximum 10,000 records.
Queries return typed JSON; integer values are strings and bytes are hex.
Exit codes: 0 all found/opened; 1 at least one not_found; 2 any input/read/query error.
Database maximum 256 MiB; JSONL maximum 8 MiB. No DNS or remote database downloads.
`;

function readBounded(path, limit) {
  const fd = openSync(path, 'r');
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > limit) throw new Error(`Expected a regular file no larger than ${limit} bytes`);
    // Read at most the checked cap even if a file grows concurrently.
    const buffer = Buffer.alloc(stat.size);
    let offset = 0;
    while (offset < buffer.length) {
      const count = readSync(fd, buffer, offset, buffer.length - offset, offset);
      if (!count) throw new Error('Input file changed or was truncated while reading');
      offset += count;
    }
    return buffer;
  } finally { closeSync(fd); }
}

function emit(value) { process.stdout.write(JSON.stringify(value) + '\n'); }
function statusCode(value) { return value.status === 'error' ? 2 : value.status === 'not_found' ? 1 : 0; }

try {
  const [command, database, ...args] = process.argv.slice(2);
  if (command === '--help' && !database) process.stdout.write(help);
  else if (command === '--version' && !database) process.stdout.write('0.1.0\n');
  else {
    if (!['metadata', 'lookup', 'enrich'].includes(command) || !database ||
      (command === 'metadata' && args.length !== 0) ||
      (command === 'lookup' && (args.length === 0 || args.length > 10000)) ||
      (command === 'enrich' && args.length !== 1)) throw new Error('Invalid arguments. Use --help.');
    const reader = open_database(readBounded(database, 268435456));
    const info = JSON.parse(metadata(reader));
    if (info.status === 'error' || command === 'metadata') {
      emit(info);
      process.exitCode = statusCode(info);
    } else if (command === 'lookup') {
      let code = 0;
      for (const ip of args) {
        const result = JSON.parse(lookup(reader, ip));
        emit({ip, ...result});
        code = Math.max(code, statusCode(result));
      }
      process.exitCode = code;
    } else {
      const text = new TextDecoder('utf-8', {fatal: true}).decode(readBounded(args[0], 8388608));
      const lines = text.split(/\r?\n/);
      if (lines.at(-1) === '') lines.pop();
      if (lines.length > 10000) throw new Error('JSONL exceeds 10,000 records');
      let code = 0;
      for (let index = 0; index < lines.length; index++) {
        try {
          const input = JSON.parse(lines[index]);
          if (!input || typeof input !== 'object' || Array.isArray(input) || typeof input.ip !== 'string') throw new Error('Expected an object with an ip string');
          const result = JSON.parse(lookup(reader, input.ip));
          emit({line: index + 1, input, mmdb: result});
          code = Math.max(code, statusCode(result));
        } catch (error) {
          emit({line: index + 1, status: 'error', code: 'invalid-jsonl', message: error.message});
          code = 2;
        }
      }
      process.exitCode = code;
    }
  }
} catch (error) {
  emit({status: 'error', code: 'host-input-error', message: error.message});
  process.exitCode = 2;
}
