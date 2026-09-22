export const VERSION = '0.8.0';
export const MAX_FILE_BYTES = 256 * 1024 * 1024;
export const MAX_RESULT_BYTES = 8 * 1024 * 1024;
export const PREVIEW_BYTES = 64 * 1024;
export type Mode = 'lookup' | 'validate' | 'compare';
export type Database = {name: string; bytes: number; sha256: string; metadata: Record<string, unknown>};
export type Request = {id: number; op: 'load'; files: File[]} | {id: number; op: Mode; ip?: string; fields?: string[]; decode?: boolean; work?: number; state?: number};
export type Reply = {id: number; databases?: Database[]; json?: string; error?: {status: 'error'; code: string; offset: number; message: string; database?: string}};
export function checkFiles(files: File[]) {
  if (files.length < 1 || files.length > 2) throw Object.assign(new Error('请选择一至两份数据库。'),{code:'browser-file-count'});
  if (files.some(f => f.size > MAX_FILE_BYTES) || files.reduce((n, f) => n + f.size, 0) > MAX_FILE_BYTES) throw Object.assign(new Error('单库与所有数据库合计均不得超过 256 MiB。'),{code:'browser-file-limit'});
}
export function fieldsFromText(text: string): string[] {
  if (text.length > 65536) throw new Error('字段输入不得超过 64 Ki 个字符。');
  const fields = text.split(/\r?\n/).filter(s => s.length > 0);
  if (new Set(fields).size > 64) throw new Error('最多允许 64 个不同的 JSON Pointer。');
  return [...new Set(fields)];
}
export function preview(json: string) {
  const bytes = new TextEncoder().encode(json);
  return {text: new TextDecoder().decode(bytes.subarray(0, PREVIEW_BYTES), {stream:true}), truncated: bytes.length > PREVIEW_BYTES};
}
