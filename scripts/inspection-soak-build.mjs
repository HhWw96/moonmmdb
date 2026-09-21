import {copyFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {root,runMoon} from './moon.mjs';
import {nativeToolchain} from './native-build.mjs';
nativeToolchain();
const folder=resolve(root,'examples/inspection_soak');
runMoon(['build','.','--target','native','--release','--deny-warn'],folder);
copyFileSync(resolve(folder,'_build/native/release/build/local/moonmmdb_inspection_soak/moonmmdb_inspection_soak.exe'),resolve(root,'dist/inspection-soak'+(process.platform==='win32'?'.exe':'')));
