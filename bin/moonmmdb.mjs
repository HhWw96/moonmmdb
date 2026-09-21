#!/usr/bin/env node
// Host I/O only. MMDB parsing, traversal, typed results and diagnostics are MoonBit.
import { openSync, fstatSync, readSync, closeSync } from 'node:fs';
import { open_database, metadata, lookup, project, validate_paths, prepare_fields, selection_status, project_prepared, compare_prepared } from '../dist/core.mjs';
import { InputError, streamOptions, inputSelector, openInput, boundedLines } from './jsonl.mjs';
import { enrichMany } from './many.mjs';
import { inspect } from './inspect.mjs';

const help = `MoonMMDB 0.6.0 — offline MaxMind DB reader
Usage:
  node bin/moonmmdb.mjs metadata DATABASE.mmdb
  node bin/moonmmdb.mjs lookup DATABASE.mmdb IP [IP ...]
  node bin/moonmmdb.mjs project DATABASE.mmdb IP POINTER [POINTER ...]
  node bin/moonmmdb.mjs enrich DATABASE.mmdb INPUT.jsonl|- [OPTIONS]
  node bin/moonmmdb.mjs diff BEFORE.mmdb AFTER.mmdb INPUT.jsonl|- [OPTIONS]
  node bin/moonmmdb.mjs enrich-many CONFIG.json INPUT.jsonl|- [OPTIONS]
  node bin/moonmmdb.mjs networks DATABASE CIDR [--max-records N] [--max-work N]
  node bin/moonmmdb.mjs validate DATABASE [--decode-data] [--max-work N] [--max-state-bytes N]
  node bin/moonmmdb.mjs --help | --version

Inspection: networks defaults to 100000 records (cap 1000000). Both commands use\n100000000 work units (cap 1000000000); validate state defaults to 64 MiB (cap 256 MiB).\nStream options:
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
diff compares selected fields (default whole record), record presence and prefix.
Map order is ignored; array order, numeric types and float bits are significant.
diff emits per-row results under "diff" and a completed summary to stderr.
diff exit codes: 0 unchanged; 1 differences; 2 any error (takes precedence).
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
process.stderr.on('error', () => {});
async function write(text, stream = process.stdout) {
  await new Promise((resolve, reject) => stream.write(text, error => error ? reject(new OutputError(error.message)) : resolve()));
}
async function emit(value) { await write(JSON.stringify(value) + '\n'); }
function statusCode(value) { return value.status === 'error' ? 2 : value.status === 'not_found' ? 1 : 0; }

async function main() {
  const [command, database, ...args] = process.argv.slice(2);
  if (command === 'networks' || command === 'validate') {
    process.exitCode = await inspect(command, process.argv.slice(3), write);
    return;
  }
  if (command === 'enrich-many') {
    process.exitCode = await enrichMany(process.argv.slice(3), write);
    return;
  }
  if (command === '--help' && !database) { await write(help); return; }
  if (command === '--version' && !database) { await write('0.6.0\n'); return; }
  if (!['metadata', 'lookup', 'project', 'enrich', 'diff'].includes(command) || !database ||
    (command === 'metadata' && args.length !== 0) ||
    (command === 'lookup' && (args.length === 0 || args.length > 10000)) ||
    (command === 'project' && (args.length < 2 || args.length > 65)) ||
    (command === 'enrich' && args.length < 1) ||
    (command === 'diff' && args.length < 2)) throw new Error('Invalid arguments. Use --help.');

  let options, selectIP, selection;
  const isDiff = command === 'diff';
  const inputPath = isDiff ? args[1] : args[0];
  if (command === 'enrich' || isDiff) {
    options = streamOptions(args.slice(isDiff ? 2 : 1));
    const ipValidation = JSON.parse(validate_paths([options.ipPath]));
    if (ipValidation.status === 'error') { await emit(ipValidation); process.exitCode = 2; return; }
    selectIP = inputSelector(options.ipPath);
    if (options.paths.length || isDiff) {
      selection = prepare_fields(options.paths.length ? options.paths : ['']);
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
    let other;
    if (isDiff) {
      other = open_database(readBounded(args[0], 268435456));
      const opened = JSON.parse(metadata(other));
      if (opened.status === 'error') { await emit({ ...opened, database: 'after' }); process.exitCode = 2; return; }
    }
    let code = 0;
    const summary = { status: 'summary', processed: 0, changed: 0, unchanged: 0, errors: 0 };
    for await (const { line, text } of boundedLines(openInput(inputPath, options.maxBytes), options)) {
      summary.processed++;
      let ip;
      try {
        const input = JSON.parse(text);
        if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Expected a JSON object');
        ip = selectIP(input);
        if (typeof ip !== 'string') throw new Error('Expected an IP string at ' + options.ipPath);
      } catch (error) {
        await emit({ line, status: 'error', code: 'invalid-jsonl', message: error.message });
        summary.errors++;
        code = 2;
        continue;
      }
      const result = JSON.parse(isDiff ? compare_prepared(reader, other, ip, selection) : selection ? project_prepared(reader, ip, selection) : lookup(reader, ip));
      // Keep numeric lexemes, negative zero and escapes from the validated source row.
      await write(`{"line":${line},"input":${text},"${isDiff ? 'diff' : 'mmdb'}":${JSON.stringify(result)}}\n`);
      if (isDiff) {
        if (result.status === 'changed') summary.changed++;
        else if (result.status === 'unchanged') summary.unchanged++;
        else summary.errors++;
      }
      code = Math.max(code, result.status === 'changed' ? 1 : statusCode(result));
    }
    if (isDiff) await write(JSON.stringify(summary) + '\n', process.stderr);
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
