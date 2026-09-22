declare module '*core.mjs' {
  export function open_database(bytes: Uint8Array): unknown;
  export function metadata(handle: unknown): string;
  export function lookup(handle: unknown, ip: string): string;
  export function project_prepared(handle: unknown, ip: string, fields: unknown): string;
  export function prepare_fields(fields: string[]): unknown;
  export function selection_status(fields: unknown): string;
  export function compare_prepared(a: unknown, b: unknown, ip: string, fields: unknown): string;
  export function validate_database(handle: unknown, decode: boolean, work: number, state: number): string;
}
declare module '*.css';
