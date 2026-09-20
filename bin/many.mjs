// File transport and configuration only; all record queries run in MoonBit.
import {openSync, closeSync, fstatSync, readSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {open_database, metadata, prepare_fields, selection_status, prepare_enrichment, enrichment_status, enrich_ip} from '../dist/core.mjs';
import {InputError, streamOptions, inputSelector, openInput, boundedLines} from './jsonl.mjs';

const MAX_DATABASE_BYTES = 268435456;
function fail(code, message) { throw new InputError(code, message); }
function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function keys(value, expected) { return object(value) && Object.keys(value).length === expected.length && expected.every(k => Object.hasOwn(value, k)); }
export function readFileBounded(path, limit) {
  const fd = openSync(path, 'r');
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > limit) fail('file-limit', 'Expected a regular file within the byte limit');
    const bytes = Buffer.alloc(stat.size);
    let used = 0;
    while (used < bytes.length) {
      const n = readSync(fd, bytes, used, bytes.length - used, null);
      if (!n) fail('host-input-error', 'File truncated while reading');
      used += n;
    }
    if (readSync(fd, Buffer.alloc(1), 0, 1, null)) fail('host-input-error', 'File grew while reading');
    return bytes;
  } finally { closeSync(fd); }
}

export function loadMany(configPath, maxTotalBytes = MAX_DATABASE_BYTES) {
  if (!Number.isSafeInteger(maxTotalBytes) || maxTotalBytes < 1 || maxTotalBytes > MAX_DATABASE_BYTES) fail('invalid-config', 'Invalid total database byte limit');
  let config;
  try { config = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(readFileBounded(configPath, 65536))); }
  catch (error) { fail('invalid-config', 'Cannot read configuration: ' + error.message); }
  if (!keys(config, ['version', 'sources']) || config.version !== 1 || !Array.isArray(config.sources) || config.sources.length < 1 || config.sources.length > 4) fail('invalid-config', 'Expected version 1 and one to four sources');
  const seen = new Set();
  const validated = config.sources.map(source => {
    if (!keys(source, ['name', 'database', 'fields']) || typeof source.name !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]{0,31}$/.test(source.name) || seen.has(source.name) || typeof source.database !== 'string' || !source.database || source.database.includes('\0') || !Array.isArray(source.fields) || !source.fields.every(x => typeof x === 'string')) fail('invalid-config', 'Invalid or duplicate source configuration');
    seen.add(source.name);
    const selector = prepare_fields(source.fields);
    const status = JSON.parse(selection_status(selector));
    if (status.status === 'error') fail(status.code, source.name + ': ' + status.message);
    return {...source, path: resolve(dirname(resolve(configPath)), source.database), selector};
  });
  let total = 0;
  const readers = [], provenance = [];
  for (const source of validated) {
    const bytes = readFileBounded(source.path, maxTotalBytes - total);
    total += bytes.length;
    const reader = open_database(bytes);
    const info = JSON.parse(metadata(reader));
    if (info.status === 'error') fail(info.code, source.name + ': ' + info.message);
    readers.push(reader);
    const raw = info.metadata.value;
    provenance.push({name:source.name, bytes:bytes.length, sha256:createHash('sha256').update(bytes).digest('hex'), database_type:raw.database_type.value, build_epoch:raw.build_epoch.value, fields:source.fields});
  }
  const handle = prepare_enrichment(validated.map(s=>s.name), readers, validated.map(s=>s.selector));
  const status = JSON.parse(enrichment_status(handle));
  if (status.status === 'error') fail(status.code, status.message);
  return {handle, provenance};
}

export async function enrichMany(args, write) {
  if (args.length < 2) fail('invalid-config', 'Expected CONFIG.json INPUT.jsonl|-');
  const [config, input, ...flags] = args;
  const options = streamOptions(flags);
  if (options.paths.length) fail('invalid-config', 'enrich-many uses fields from its configuration, not --field');
  const check = JSON.parse(selection_status(prepare_fields([options.ipPath])));
  if (check.status === 'error') fail(check.code, check.message);
  const select = inputSelector(options.ipPath);
  const {handle, provenance} = loadMany(config);
  const sources = Object.create(null);
  for (const p of provenance) sources[p.name] = {...p, found:0, not_found:0, errors:0, missing_fields:0};
  const summary = {status:'summary', processed:0, valid_ips:0, invalid_inputs:0, sources};
  let code = 0;
  for await (const {line,text} of boundedLines(openInput(input, options.maxBytes), options)) {
    summary.processed++;
    let ip;
    try {
      const row = JSON.parse(text);
      if (!object(row) || typeof (ip = select(row)) !== 'string') throw new Error('Expected an object with an IP string at ' + options.ipPath);
    } catch (error) {
      summary.invalid_inputs++; code=2;
      await write(JSON.stringify({line,status:'error',code:'invalid-jsonl',message:error.message})+'\n');
      continue;
    }
    const result = JSON.parse(enrich_ip(handle, ip));
    if (!result.sources) { summary.invalid_inputs++; code=2; }
    else {
      summary.valid_ips++;
      for (const [name, r] of Object.entries(result.sources)) {
        if (r.status === 'error') sources[name].errors++;
        else if (r.status === 'not_found') sources[name].not_found++;
        else sources[name].found++;
        if (r.fields) sources[name].missing_fields += Object.values(r.fields).filter(f=>f.status==='missing').length;
      }
      code = Math.max(code, result.status==='error'?2:result.status==='not_found'?1:0);
    }
    await write(`{"line":${line},"input":${text},"enrichment":${JSON.stringify(result)}}\n`);
  }
  await write(JSON.stringify(summary)+'\n', process.stderr);
  return code;
}
