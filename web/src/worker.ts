import * as core from '../../dist/core.mjs';
import {analyze} from './analysis';
import {checkFiles, MAX_RESULT_BYTES, type Request, type Reply, type Database} from './protocol';
let handles: unknown[] = [];
let loaded: Database[] = [];
let busy = false;
function error(code: string, message: string, database?: string) { return {status: 'error' as const, code, offset: -1, message, ...(database ? {database} : {})}; }
function checkJson(json: string) {
  if (new TextEncoder().encode(json).byteLength > MAX_RESULT_BYTES) throw error('browser-result-limit', '结果超过 8 MiB；请缩小字段范围或使用命令行工具。');
  return json;
}
function metadataFields(raw: {value: Record<string, {value: unknown}>}) {
  return Object.fromEntries(Object.entries(raw.value).map(([key, value]) => [key, value.value]));
}
self.onmessage = async (event: MessageEvent<Request>) => {
  const request = event.data;
  const reply: Reply = {id: request.id};
  if (busy) { self.postMessage({...reply, error: error('browser-busy', '已有操作正在运行。')}); return; }
  busy = true;
  try {
    if (request.op === 'load') {
      handles = [];
      loaded = [];
      checkFiles(request.files);
      if (!self.crypto?.subtle) throw error('browser-unsupported', '当前环境不支持本地 SHA-256，请使用受支持的桌面浏览器。');
      const opened: unknown[] = [];
      const databases: Database[] = [];
      for (const file of request.files) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
        const handle = core.open_database(bytes);
        const result = JSON.parse(checkJson(core.metadata(handle)));
        if (result.status !== 'opened') throw {...result, database: file.name};
        opened.push(handle);
        databases.push({name: file.name, bytes: file.size, sha256: [...hash].map(b => b.toString(16).padStart(2, '0')).join(''), metadata: metadataFields(result.metadata)});
      }
      handles = opened;
      loaded = databases;
      reply.databases = databases;
    } else {
      if (!handles.length) throw error('browser-not-loaded', '请先加载数据库。');
      if (request.op === 'analyze') {
        reply.json=checkJson(await analyze(request.options,handles,loaded,progress=>self.postMessage({id:request.id,progress})));
      } else if (request.op === 'validate') {
        const work = request.work ?? 100_000_000, state = request.state ?? 64 * 1024 * 1024;
        if (!Number.isInteger(work) || work < 1 || work > 1_000_000_000 || !Number.isInteger(state) || state < 1 || state > 256 * 1024 * 1024) throw error('browser-invalid-limit', '检查预算超出允许范围。');
        reply.json = checkJson(core.validate_database(handles[0], request.decode ?? false, work, state));
      } else {
        const ip = request.ip ?? '';
        if (ip.length > 256) throw error('invalid-ip', 'IP 地址输入过长。');
        const paths = request.fields ?? [];
        if (paths.length > 64 || paths.some(p => typeof p !== 'string') || paths.join('\n').length > 65536) throw error('invalid-path', '字段范围超过浏览器限制。');
        const selection = core.prepare_fields(paths.length ? paths : ['']);
        const status = JSON.parse(core.selection_status(selection));
        if (status.status === 'error') throw status;
        if (request.op === 'compare') {
          if (handles.length !== 2) throw error('browser-not-loaded', '更新对比需要旧库和新库。');
          reply.json = checkJson(core.compare_prepared(handles[0], handles[1], ip, selection));
        } else if (request.op === 'lookup') {
          reply.json = checkJson(paths.length ? core.project_prepared(handles[0], ip, selection) : core.lookup(handles[0], ip));
        } else throw error('browser-invalid-operation', '未知操作。');
      }
    }
  } catch (cause) {
    if (request.op === 'load') handles = [];
    if (cause && typeof cause === 'object' && 'code' in cause) {
      const detail=cause as NonNullable<Reply['error']>;
      reply.error={status:'error',code:String(detail.code),offset:detail.offset??-1,message:detail.message,...(detail.database?{database:detail.database}:{})};
    } else reply.error=error('browser-runtime-error', cause instanceof Error ? cause.message : String(cause));
  } finally { busy = false; }
  self.postMessage(reply);
};
