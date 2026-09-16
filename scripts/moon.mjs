import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export function runMoon(args, cwd = root, capture = false) {
  const config = resolve(root, '.local-toolchain.json');
  const local = existsSync(config) ? JSON.parse(readFileSync(config, 'utf8')).moonHome : null;
  const moonHome = process.env.MOON_HOME || local;
  const env = { ...process.env };
  if (moonHome) {
    env.MOON_HOME = moonHome;
    const pathKey = Object.keys(env).find(key => key.toLowerCase() === 'path');
    const oldPath = pathKey ? env[pathKey] : '';
    if (pathKey) delete env[pathKey];
    env.PATH = [resolve(moonHome, 'bin'), dirname(process.execPath), oldPath].join(delimiter);
  }
  const binary = moonHome ? resolve(moonHome, 'bin', process.platform === 'win32' ? 'moon.exe' : 'moon') : 'moon';
  const result = spawnSync(binary, args, { cwd, env, encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`MoonBit failed (${result.status}): ${result.stdout || ''}${result.stderr || ''}`);
  return result.stdout || '';
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { runMoon(process.argv.slice(2)); } catch (error) { console.error(error.message); process.exitCode = 2; }
}
