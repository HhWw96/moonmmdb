import { copyFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { root, runMoon } from './moon.mjs';
runMoon(['build', '--target', 'js', '--release']);
mkdirSync(resolve(root, 'dist'), {recursive: true});
copyFileSync(resolve(root, '_build/js/release/build/bridge/bridge.js'), resolve(root, 'dist/core.mjs'));
console.log('Built MoonMMDB 0.4.0 (MoonBit core, JavaScript target).');
runMoon(['build', '--target', 'js', '--release'], resolve(root,'examples/log_analytics'));
copyFileSync(resolve(root,'examples/log_analytics/_build/js/release/build/local/moonmmdb_log_analytics/moonmmdb_log_analytics.js'), resolve(root,'dist/analytics.mjs'));
