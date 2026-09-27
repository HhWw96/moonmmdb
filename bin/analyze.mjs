import {VERSION} from './version.mjs';
// Transport and provenance only; parsing, queries, counters and reports are MoonBit.
import { createHash } from 'node:crypto';
import * as analytics from '../dist/formal-analytics.mjs';
import { streamOptions, openInput, boundedLines, InputError } from './jsonl.mjs';
import { readFileBounded } from './many.mjs';

export function analyzeOptions(args) {
  const remaining = [], seen = new Set();
  let top = 10, maxGroups = 10000, diagnosticLimit = 0;
  for (let i = 0; i < args.length; i += 2) {
    const name = args[i], value = args[i + 1];
    if (name === '--diagnostic-limit') {
      if (seen.has(name) || !/^(0|[1-9][0-9]*)$/.test(value ?? '') || Number(value)>1000) throw new InputError('host-input-error','Invalid diagnostic limit');
      seen.add(name); diagnosticLimit=Number(value);
    } else if (name === '--top' || name === '--max-groups') {
      const cap = name === '--top' ? 100 : 10000;
      if (seen.has(name) || !/^[1-9][0-9]*$/.test(value ?? '') || !Number.isSafeInteger(Number(value)) || Number(value) > cap)
        throw new InputError('host-input-error', `${name} must occur once with an integer from 1 to ${cap}`);
      seen.add(name);
      if (name === '--top') top = Number(value); else maxGroups = Number(value);
    } else remaining.push(name, value);
  }
  const options = streamOptions(remaining);
  if (options.paths.length) throw new InputError('host-input-error', 'analyze has fixed country and ASN fields; --field is unsupported');
  return { ...options, top, maxGroups, diagnosticLimit };
}

function check(text) {
  if (text) {
    const error = JSON.parse(text);
    throw new InputError(error.code, error.message ?? error.code);
  }
}

export async function analyze(args, write, expectedSources = []) {
  if (args.length < 3) throw new InputError('host-input-error', 'Expected CITY ASN INPUT; use --help');
  const [cityPath, asnPath, inputPath] = args;
  const options = analyzeOptions(args.slice(3));
  let city = readFileBounded(cityPath, 268435456);
  let asn = readFileBounded(asnPath, 268435456 - city.length);
  const hashes = [city, asn].map(b => createHash('sha256').update(b).digest('hex'));
  const sizes = [city.length, asn.length];
  for (const expected of expectedSources) {
    const i = expected.role === 'city' ? 0 : expected.role === 'asn' ? 1 : -1;
    if (i >= 0 && (expected.sha256 !== undefined && expected.sha256 !== hashes[i] || expected.bytes !== undefined && expected.bytes !== String(sizes[i])))
      throw new InputError('source-mismatch', 'Database does not match role ' + expected.role);
  }
  const handle = analytics.analysis_create(city, asn, options.top, options.maxGroups, options.ipPath);
  // Readers own isolated snapshots; release host read buffers before streaming.
  city = null; asn = null;
  try {
    check(analytics.analysis_error(handle));
    const databases = JSON.parse(analytics.analysis_metadata(handle));
    for (const [i, name] of ['city', 'asn'].entries()) Object.assign(databases[name], { sha256: hashes[i], bytes: String(sizes[i]) });
    const hash = createHash('sha256');
    let bytes = 0;
    const source = openInput(inputPath, options.maxBytes);
    async function* observed() {
      try {
        for await (const chunk of source) { hash.update(chunk); bytes += chunk.length; yield chunk; }
      } finally { source.destroy(); }
    }
    const diagnostics = options.diagnosticLimit ? analytics.diagnostics_create(options.diagnosticLimit) : null;
    for await (const { text, line, start, end } of boundedLines(observed(), {...options,ranges:options.diagnosticLimit>0})) {
      if (diagnostics) {
        const outcome=analytics.analysis_line_detailed(handle,text);
        if(JSON.parse(outcome).status==='error')check(outcome);
        analytics.diagnostics_add(diagnostics,outcome,line,start,end);
      } else check(analytics.analysis_line(handle, text));
    }
    const report = JSON.parse(analytics.analysis_finish(handle));
    if (report.status === 'error') check(JSON.stringify(report));
    report.tool_version = VERSION;
    report.parameters = { ip_path: options.ipPath, top: options.top, max_groups: options.maxGroups, max_records: options.maxRecords, max_input_bytes: options.maxBytes, max_line_bytes: options.maxLineBytes, max_json_depth: 128 };
    if (diagnostics) { report.diagnostics=JSON.parse(analytics.diagnostics_finish(diagnostics)); report.parameters.diagnostic_limit=options.diagnosticLimit; }
    report.databases = databases;
    report.input = { bytes: String(bytes), sha256: hash.digest('hex') };
    await write(JSON.stringify(report) + '\n');
    return report.exit_code;
  } finally { analytics.analysis_close(handle); }
}
