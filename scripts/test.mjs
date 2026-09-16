import { spawnSync } from 'node:child_process';
import { root, runMoon } from './moon.mjs';
runMoon(['test', '--target', 'js']);
runMoon(['test', '--target', 'wasm-gc']);
await import('./build.mjs');
const test = spawnSync(process.execPath, ['--test', 'tests/cli.test.mjs'], {cwd:root, stdio:'inherit'});
if (test.error) throw test.error;
if (test.status !== 0) process.exitCode = test.status || 2;
