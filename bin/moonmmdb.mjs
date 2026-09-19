#!/usr/bin/env node
// Host I/O only. MMDB parsing, traversal, typed results and diagnostics are MoonBit.
import { openSync, fstatSync, readSync, closeSync } from 'node:fs';
import { open_database, metadata, lookup, project, validate_paths, prepare_fields, selection_status, project_prepared } from '../dist/core.mjs';
import { InputError, streamOptions, inputSelector, openInput, boundedLines } from './jsonl.mjs';

const help = `MoonMMDB 0.2.0 — offline MaxMind DB reader
Usage:
  node bin/moonmmdb.mjs metadata DATABASE.mmdb
  node bin/moonmmdb.mjs lookup DATABASE.mmdb IP [IP ...]
  node bin/moonmmdb.mjs project DATABASE.mmdb IP POINTER [POINTER ...]
  node bin/moonmmdb.mjs enrich DATABASE.mmdb INPUT.jsonl|- [OPTIONS]
  node bin/moonmmdb.mjs --help | --version

Stream options:
  --field POINTER        Select a database field; repeat for up to 64 paths.
  --ip-path POINTER      Input IP field (default /ip), e.g. /client/ip.
  --max-records N        Default 10000; maximum 1000000.
  --max-input-bytes N    Default 8388608; maximum 1073741824.
  --max-line-bytes N     Default 8388608; maximum 8388608 (LF excluded).

enrich expects a JSON object per line; output preserves the original under
"input" and puts the lookup under "mmdb". Use - to read stdin incrementally.
UTF-8, LF and CRLF are supported. A final newline is optional. Blank lines fail.
Queries return typed JSON; integer values are strings and bytes are hex.
Pointers use /country/iso_code, /array/0, ~0 for ~ and ~1 for /.
Projection decodes one complete bounded record. Missing fields are explicit.
Earlier rows can be emitted before a later input error; check the final exit code.
Exit codes: 0 all found/opened; 1 at least one not_found; 2 any input/read/query error.
Database maximum 256 MiB. No DNS or remote database downloads.
`;

function readBounded(path, limit) {
  const fd = openSync(path, 'r');
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > limit) throw new Error(`Expected a regular file no larger than ${limit} bytes`);
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

class OutputError extends Error {}
process.stdout.on('error', () => {});
async function write(text) {
  await new Promise((resolve, reject) => process.stdout.write(text, error => error ? reject(new OutputError(error.message)) : resolve()));
}
async function emit(value) { await write(JSON.stringify(value) + '\n'); }
function statusCode(value) { return value.status === 'error' ? 2 : value.status === 'not_found' ? 1 : 0; }

async function main() {
  const [command, database, ...args] = process.argv.slice(2);
  if (command === '--help' && !database) { await write(help); return; }
  if (command === '--version' && !database) { await write('0.2.0\n'); return; }
  if (!['metadata', 'lookup', 'project', 'enrich'].includes(command) || !database ||
    (command === 'metadata' && args.length !== 0) ||
    (command === 'lookup' && (args.length === 0 || args.length > 10000)) ||
    (command === 'project' && (args.length < 2 || args.length > 65)) ||
    (command === 'enrich' && args.length < 1)) throw new Error('Invalid arguments. Use --help.');

  let options, selectIP, selection;
  if (command === 'enrich') {
    options = streamOptions(args.slice(1));
    const ipValidation = JSON.parse(validate_paths([options.ipPath]));
    if (ipValidation.status === 'error') { await emit(ipValidation); process.exitCode = 2; return; }
    selectIP = inputSelector(options.ipPath);
    if (options.paths.length) {
      selection = prepare_fields(options.paths);
      const validation = JSON.parse(selection_status(selection));
      if (validation.status === 'error') { await emit(validation); process.exitCode = 2; return; }
    }
  }
  const reader = open_database(readBounded(database, 268435456));
  const info = JSON.parse(metadata(reader));
  if (info.status === 'error' || command === 'metadata') {
    await emit(info);
    process.exitCode = statusCode(info);
  } else if (command === 'project') {
    const result = JSON.parse(project(reader, args[0], args.slice(1)));
    await emit({ ip: args[0], ...result });
    process.exitCode = statusCode(result);
  } else if (command === 'lookup') {
    let code = 0;
    for (const ip of args) {
      const result = JSON.parse(lookup(reader, ip));
      await emit({ ip, ...result });
      code = Math.max(code, statusCode(result));
    }
    process.exitCode = code;
  } else {
    let code = 0;
    for await (const { line, text } of boundedLines(openInput(args[0], options.maxBytes), options)) {
      let ip;
      try {
        const input = JSON.parse(text);
        if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Expected a JSON object');
        ip = selectIP(input);
        if (typeof ip !== 'string') throw new Error('Expected an IP string at ' + options.ipPath);
      } catch (error) {
        await emit({ line, status: 'error', code: 'invalid-jsonl', message: error.message });
        code = 2;
        continue;
      }
      const result = JSON.parse(selection ? project_prepared(reader, ip, selection) : lookup(reader, ip));
      // Keep numeric lexemes, negative zero and escapes from the validated source row.
      await write(`{"line":${line},"input":${text},"mmdb":${JSON.stringify(result)}}\n`);
      code = Math.max(code, statusCode(result));
    }
    process.exitCode = code;
  }
}

try { await main(); }
catch (error) {
  process.exitCode = 2;
  const diagnostic = { status: 'error', code: error instanceof OutputError ? 'host-output-error' : error instanceof InputError ? error.code : 'host-input-error', message: error.message };
  if (error instanceof InputError && error.line !== undefined) diagnostic.line = error.line;
  if (error instanceof OutputError) process.stderr.write(JSON.stringify(diagnostic) + '\n');
  else {
    try { await emit(diagnostic); }
    catch (outputError) { process.stderr.write(JSON.stringify({ status: 'error', code: 'host-output-error', message: outputError.message }) + '\n'); }
  }
}
