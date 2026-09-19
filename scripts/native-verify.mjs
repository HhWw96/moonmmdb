import {readFileSync,writeFileSync,mkdirSync,existsSync,copyFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {root,runMoon} from './moon.mjs';
import {sourceFingerprint,sha256} from './evidence.mjs';
const localCompiler=resolve(root,'verification/local/toolchains/extracted/w64devkit/bin/gcc.exe');
const configured=process.env.MOON_CC || (existsSync(localCompiler)?localCompiler:null);
if(configured) process.env.MOON_CC=configured;
const out=resolve(root,'verification/local/native.json');
mkdirSync(resolve(root,'verification/local'),{recursive:true});
const report={started:new Date().toISOString(),status:'running',platform:process.platform,arch:process.arch,compiler_override:configured,source_sha256:sourceFingerprint(),steps:[]};
const save=()=>writeFileSync(out,JSON.stringify(report,null,2)+'\n');save();
function run(name,args,cwd=root,expectedTests=null) {
  const output=runMoon(args,cwd,true);
  writeFileSync(resolve(root,'verification/local/native-'+name+'.log'),output);
  if(expectedTests!==null && !output.includes(`Total tests: ${expectedTests}, passed: ${expectedTests}, failed: 0.`)) throw new Error(name+' did not execute expected tests: '+output);
  report.steps.push({name,args,expected_tests:expectedTests,passed:true,output});save();
}
try {
  if(process.platform!=='win32' || process.arch!=='x64') throw new Error('This verifier and file probe currently target Windows x64; other hosts are not certified.');
  report.toolchain=runMoon(['version','--all'],root,true);
  if(configured) {
    const version=spawnSync(configured,['--version'],{encoding:'utf8'});
    if(version.status!==0) throw new Error('Cannot execute configured C compiler');
    report.c_compiler=version.stdout.trim();report.c_compiler_sha256=sha256(readFileSync(configured));
  }
  if(process.platform==='win32' && configured===localCompiler) {
    const directory=resolve(root,'verification/local/toolchains/compat');
    mkdirSync(directory,{recursive:true});
    const launcher=resolve(directory,'cc.exe');
    const build=spawnSync(configured,['-municode','-O2',resolve(root,'scripts/native-cc.c'),'-o',launcher],{encoding:'utf8'});
    if(build.status!==0) throw new Error('Cannot build MinGW compatibility launcher: '+build.stderr);
    process.env.MOONMMDB_GCC=configured;
    process.env.MOON_CC=launcher;
    process.env.MOON_AR=resolve(root,'verification/local/toolchains/extracted/w64devkit/bin/ar.exe');
    report.compatibility={macro:'_CRT_RAND_S',reason:'Expose MinGW CRT rand_s declaration required by pinned MoonBit runtime',launcher_sha256:sha256(readFileSync(launcher)),runtime_modified:false};
  }
  run('probe-format',['fmt','--check'],resolve(root,'examples/native_probe'));
  run('debug',['test','--target','native','-p','HhWw96/moonmmdb','--deny-warn'],root,21);
  run('release',['test','--target','native','--release','-p','HhWw96/moonmmdb','--deny-warn'],root,21);
  run('consumer',['test','--target','native','--release','-p','local/moonmmdb_log_example','--deny-warn'],resolve(root,'examples/log_consumer'),1);
  run('probe',['build','.','--target','native','--release','--deny-warn'],resolve(root,'examples/native_probe'));
  const executable=resolve(root,'examples/native_probe/_build/native/release/build/local/moonmmdb_native_probe/moonmmdb_native_probe.exe');
  if(!existsSync(executable)) throw new Error('Native output executable was not found at expected path');
  report.executable=executable;
  report.executable_sha256=sha256(readFileSync(executable));
  mkdirSync(resolve(root,'dist'),{recursive:true});
  copyFileSync(executable,resolve(root,'dist/moonmmdb-native-probe.exe'));
  if(sourceFingerprint()!==report.source_sha256)throw new Error('Sources changed during native verification');
  report.status='passed';
} catch(error) {report.status='failed';report.error=error.message;console.error(error.message);process.exitCode=1;}
report.finished=new Date().toISOString();save();
console.log(JSON.stringify({status:report.status,steps:report.steps.length,executable:report.executable}));
