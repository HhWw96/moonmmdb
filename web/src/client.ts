import type {Reply, Request} from './protocol';
export type Operation = Request extends infer R ? R extends Request ? Omit<R, 'id'> : never : never;
export class BrowserClient {
  private worker?: Worker;
  private nextId = 0;
  private pending?: {id: number; resolve: (reply: Reply) => void; reject: (error: Error) => void};
  constructor(private source: string) {}
  request(request: Operation): Promise<Reply> {
    if (this.pending) return Promise.reject(new Error('已有操作正在运行。'));
    if (!this.worker) {
      const url = URL.createObjectURL(new Blob([this.source], {type: 'text/javascript'}));
      try { this.worker = new Worker(url); } finally { URL.revokeObjectURL(url); }
      this.worker.onmessage = ({data}: MessageEvent<Reply>) => {
        if (this.pending?.id !== data.id) return;
        const pending = this.pending; this.pending = undefined; pending.resolve(data);
      };
      this.worker.onerror = () => this.close('后台解析失败，请重新加载数据库。');
      this.worker.onmessageerror = () => this.close('后台通信失败，请重新加载数据库。');
    }
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      this.pending = {id, resolve, reject};
      try { this.worker!.postMessage({...request, id}); }
      catch (cause) { this.close(cause instanceof Error ? cause.message : String(cause)); }
    });
  }
  close(message = '操作已取消。') {
    this.worker?.terminate(); this.worker = undefined;
    const pending = this.pending; this.pending = undefined;
    pending?.reject(new Error(message));
  }
}
