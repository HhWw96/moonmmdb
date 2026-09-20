import { spawnSync } from 'node:child_process';
import { root, runMoon } from './moon.mjs';
runMoon(['test', '--target', 'js']);
runMoon(['test', '--target', 'wasm-gc']);
await import('./build.mjs');
const test = spawnSync(process.execPath, ['--test', 'tests/cli.test.mjs', 'tests/evidence.test.mjs', 'tests/api.test.mjs', 'tests/stream.test.mjs', 'tests/diff.test.mjs', 'tests/many.test.mjs'], {cwd:root, stdio:'inherit'});
if (test.error) throw test.error;
if (test.status !== 0) process.exitCode = test.status || 2;
