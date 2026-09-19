// Bounded host transport. Database parsing and field projection stay in MoonBit.
import { createReadStream, openSync, fstatSync, closeSync } from 'node:fs';

export class InputError extends Error {
  constructor(code, message, line) { super(message); this.code = code; this.line = line; }
}

export function streamOptions(args) {
  const options = { paths: [], ipPath: '/ip', maxBytes: 8388608, maxLineBytes: 8388608, maxRecords: 10000 };
  const names = new Map([
    ['--ip-path', ['ipPath']], ['--max-input-bytes', ['maxBytes', 1073741824]],
    ['--max-line-bytes', ['maxLineBytes', 8388608]], ['--max-records', ['maxRecords', 1000000]],
  ]);
  const seen = new Set();
  for (let i = 0; i < args.length; i += 2) {
    const name = args[i], value = args[i + 1];
    if (value === undefined) throw new Error('Missing option value: ' + name);
    if (name === '--field') {
      if (options.paths.length === 64) throw new Error('At most 64 field paths are allowed');
      options.paths.push(value);
      continue;
    }
    if (!names.has(name) || seen.has(name)) throw new Error('Unknown or duplicate option: ' + name);
    seen.add(name);
    const [key, cap] = names.get(name);
    if (cap) {
      if (!/^[1-9][0-9]*$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > cap) {
        throw new Error(`${name} must be an integer between 1 and ${cap}`);
      }
      options[key] = Number(value);
    } else options[key] = value;
  }
  return options;
}

// Call only after the MoonBit JSON Pointer validator accepts the path.
export function inputSelector(pointer) {
  const tokens = pointer === '' ? [] : pointer.slice(1).split('/').map(s => s.replace(/~1/g, '/').replace(/~0/g, '~'));
  return input => {
    let value = input;
    for (const token of tokens) {
      if (value === null || typeof value !== 'object') return undefined;
      if (Array.isArray(value) && (!/^(0|[1-9][0-9]*)$/.test(token) || Number(token) >= value.length)) return undefined;
      if (!Object.hasOwn(value, token)) return undefined;
      value = value[token];
    }
    return value;
  };
}

export function openInput(path, maxBytes) {
  if (path === '-') return process.stdin;
  const fd = openSync(path, 'r');
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile()) throw new InputError('host-input-error', 'JSONL input must be a regular file or - for stdin');
    if (stat.size > maxBytes) throw new InputError('input-limit', 'JSONL exceeds configured byte limit');
    return createReadStream(path, { fd, autoClose: true, highWaterMark: 65536 });
  } catch (error) { closeSync(fd); throw error; }
}

// Fixed-size buffering bounds memory even for long lines or tiny input chunks.
export async function* boundedLines(source, options) {
  const lineBuffer = Buffer.allocUnsafe(options.maxLineBytes);
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  let used = 0, total = 0, line = 0;
  function complete() {
    line++;
    if (line > options.maxRecords) throw new InputError('record-limit', 'JSONL exceeds configured record limit', line);
    let length = used;
    if (length && lineBuffer[length - 1] === 13) length--;
    let text;
    try { text = decoder.decode(lineBuffer.subarray(0, length)); }
    catch { throw new InputError('invalid-utf8', 'JSONL is not valid UTF-8', line); }
    if (line === 1 && text.startsWith('\uFEFF')) text = text.slice(1);
    used = 0;
    return { line, text };
  }
  try {
    for await (const chunk of source) {
      total += chunk.length;
      if (total > options.maxBytes) throw new InputError('input-limit', 'JSONL exceeds configured byte limit', line + 1);
      let start = 0;
      while (start < chunk.length) {
        const newline = chunk.indexOf(10, start);
        const end = newline < 0 ? chunk.length : newline;
        const size = end - start;
        if (used + size > options.maxLineBytes) throw new InputError('line-limit', 'JSONL line exceeds configured byte limit', line + 1);
        chunk.copy(lineBuffer, used, start, end);
        used += size;
        start = end + 1;
        if (newline >= 0) yield complete();
      }
    }
    if (used) yield complete();
  } finally {
    if (typeof source.destroy === 'function') source.destroy();
  }
}
