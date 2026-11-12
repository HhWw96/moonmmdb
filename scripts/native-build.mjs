import {existsSync,mkdirSync,readFileSync,writeFileSync,copyFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {root,runMoon} from './moon.mjs';
import {sourceFingerprint,sha256} from './evidence.mjs';
import {assertToolchain} from './toolchain.mjs';
import {configureMsvc} from './msvc.mjs';

export function nativeToolchain() {
  if(process.arch!=='x64'||!['win32','linux'].includes(process.platform))throw new Error('Native product builds support Windows/Linux x64');
  if(process.platform==='win32')return configureMsvc();
  const compiler=process.env.MOON_CC||'gcc';
  const version=spawnSync(compiler,['--version'],{encoding:'utf8'});
  if(version.status!==0)throw new Error('C compiler unavailable: '+compiler);
  process.env.MOON_CC=compiler;
  return {compiler,version:version.stdout.trim(),family:'gcc-compatible'};
}

export function buildNative() {
  const compiler=nativeToolchain();
  const toolchain=assertToolchain();
  const directory=resolve(root,'native_cli');
  const output=runMoon(['build','.','--target','native','--release','--deny-warn'],directory,true);
  const name='moonmmdb_native_cli'+(process.platform==='win32'?'.exe':'.exe');
  const built=resolve(directory,'_build/native/release/build/local/moonmmdb_native_cli',name);
  if(!existsSync(built))throw new Error('Missing Native compiler output: '+built);
  const executable=resolve(root,'dist','moonmmdb'+(process.platform==='win32'?'.exe':''));
  mkdirSync(dirname(executable),{recursive:true});copyFileSync(built,executable);
  const report={status:'passed',platform:process.platform,arch:process.arch,toolchain,compiler,source_sha256:sourceFingerprint(),executable_sha256:sha256(readFileSync(executable)),output};
  mkdirSync(resolve(root,'verification/local'),{recursive:true});
  writeFileSync(resolve(root,'verification/local/native-build.json'),JSON.stringify(report,null,2)+'\n');
  return executable;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(buildNative());
