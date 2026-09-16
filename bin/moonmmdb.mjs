#!/usr/bin/env node
// Host I/O only. MMDB parsing, traversal, typed results and diagnostics are MoonBit.
import { openSync, fstatSync, readSync, closeSync } from 'node:fs';
import { open_database, metadata, lookup, project, validate_paths } from '../dist/core.mjs';

const help = `MoonMMDB 0.2.0 — offline MaxMind DB reader
Usage:
  node bin/moonmmdb.mjs metadata DATABASE.mmdb
  node bin/moonmmdb.mjs lookup DATABASE.mmdb IP [IP ...]
  node bin/moonmmdb.mjs project DATABASE.mmdb IP POINTER [POINTER ...]
  node bin/moonmmdb.mjs enrich DATABASE.mmdb INPUT.jsonl [--field POINTER ...]
  node bin/moonmmdb.mjs --help | --version

enrich expects one JSON object per line with an "ip" string; output keeps the
input under "input" and puts the lookup under "mmdb". Maximum 10,000 records.
Queries return typed JSON; integer values are strings and bytes are hex.
Pointers use /country/iso_code, /array/0, ~0 for ~ and ~1 for /. Up to 64 paths.
Projection decodes one complete bounded record. Missing fields are explicit.
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

// Await completion of every row: a slow consumer must not queue an entire run.
class OutputError extends Error {}
process.stdout.on('error', () => {}); // The write callback reports stream failures.
async function write(text) {
  await new Promise((resolve, reject) => process.stdout.write(text, error => error ? reject(new OutputError(error.message)) : resolve()));
}
async function emit(value) { await write(JSON.stringify(value) + '\n'); }
function statusCode(value) { return value.status === 'error' ? 2 : value.status === 'not_found' ? 1 : 0; }

try {
  const [command, database, ...args] = process.argv.slice(2);
  if (command === '--help' && !database) await write(help);
  else if (command === '--version' && !database) await write('0.2.0\n');
  else {
    if (!['metadata', 'lookup', 'project', 'enrich'].includes(command) || !database ||
      (command === 'metadata' && args.length !== 0) ||
      (command === 'lookup' && (args.length === 0 || args.length > 10000)) ||
      (command === 'project' && (args.length < 2 || args.length > 65)) ||
      (command === 'enrich' && (args.length < 1 || args.length > 129 || args.length % 2 !== 1 || args.some((arg,index) => index % 2 === 1 && arg !== '--field')))) throw new Error('Invalid arguments. Use --help.');
    const paths = command === 'enrich' ? args.filter((_, index) => index > 0 && index % 2 === 0) : [];
    if(paths.length) {
      const validation=JSON.parse(validate_paths(paths));
      if(validation.status==='error') {
        await emit(validation);
        process.exitCode=2;
      }
    }
    if(process.exitCode!==2) {
    const reader = open_database(readBounded(database, 268435456));
    const info = JSON.parse(metadata(reader));
    if (info.status === 'error' || command === 'metadata') {
      await emit(info);
      process.exitCode = statusCode(info);
    } else if (command === 'project') {
      const result = JSON.parse(project(reader, args[0], args.slice(1)));
      await emit({ip:args[0], ...result});
      process.exitCode = statusCode(result);
    } else if (command === 'lookup') {
      let code = 0;
      for (const ip of args) {
        const result = JSON.parse(lookup(reader, ip));
        await emit({ip, ...result});
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
        let input;
        try {
          input = JSON.parse(lines[index]);
          if (!input || typeof input !== 'object' || Array.isArray(input) || typeof input.ip !== 'string') throw new Error('Expected an object with an ip string');
        } catch (error) {
          await emit({line: index + 1, status: 'error', code: 'invalid-jsonl', message: error.message});
          code = 2;
          continue;
        }
        const result = JSON.parse(paths.length ? project(reader, input.ip, paths) : lookup(reader, input.ip));
        // Validation above does not authorize re-encoding customer numbers.
        // Embed the validated original JSON object to retain integer/exponent tokens.
        await write(`{"line":${index + 1},"input":${lines[index]},"mmdb":${JSON.stringify(result)}}\n`);
        code = Math.max(code, statusCode(result));
      }
      process.exitCode = code;
    }
    }
  }
} catch (error) {
  process.exitCode = 2;
  const diagnostic = {status:'error', code:error instanceof OutputError ? 'host-output-error' : 'host-input-error', message:error.message};
  if (error instanceof OutputError) process.stderr.write(JSON.stringify(diagnostic) + '\n');
  else {
    try { await emit(diagnostic); }
    catch (outputError) { process.stderr.write(JSON.stringify({status:'error',code:'host-output-error',message:outputError.message}) + '\n'); }
  }
}
