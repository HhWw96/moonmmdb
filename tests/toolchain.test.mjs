import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {assertToolchain,checkWorkflowPins,MOONBIT_VERSION} from '../scripts/toolchain.mjs';
test('compiler pin checks the compiler, including its revision',()=>{
  assert.equal(assertToolchain(`moon 0.1.20260920\nmoonc v${MOONBIT_VERSION} (2026-09-18)\n`),`moon 0.1.20260920\nmoonc v${MOONBIT_VERSION} (2026-09-18)\n`);
  for(const actual of ['0.10.11+6ff76a5f9','0.10.14+7d59c7ec9','0.10.14+other','0.10.15+7d59c7ec9'])assert.throws(()=>assertToolchain(`moonc v${actual}\n`),/Expected pinned moonc/);
  assert.throws(()=>assertToolchain(`moon ${MOONBIT_VERSION}\n`),/found unknown/);
});
test('all compiler-installing workflows match the build pin',()=>checkWorkflowPins());
test('vendored source bytes match provenance and AES differs only by its notice',()=>{
  const base=new URL('../native_cli/vendor/x/',import.meta.url);
  const provenance=JSON.parse(readFileSync(new URL('PROVENANCE.json',base),'utf8'));
  const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
  assert.ok(provenance.files.length>0);
  for(const entry of provenance.files){
    assert.match(entry.path,/^crypto\/[a-z0-9_]+\.mbt$/);
    const bytes=readFileSync(new URL(entry.path,base));
    assert.equal(hash(bytes),entry.local_sha256,entry.path);
    if(entry.path==='crypto/aes.mbt'){
      const body=bytes.toString('utf8').replace(/\/\/\n\/\/ Modified by MoonMMDB contributors:[\s\S]*?source hashes\.\n/,'');
      assert.equal(hash(body),entry.upstream_sha256,'AES algorithm bytes must remain upstream');
    }else assert.equal(hash(bytes),entry.upstream_sha256,entry.path);
  }
});

test('Windows builds accept only MSVC-compatible drivers',async()=>{
  const {assertMsvcName}=await import('../scripts/msvc.mjs');
  for(const name of ['cl.exe','clang-cl.exe','C:/Tools/VC/cl.exe'])assert.doesNotThrow(()=>assertMsvcName(name));
  for(const name of ['gcc.exe','cc.exe','clang.exe'])assert.throws(()=>assertMsvcName(name),/MinGW is not supported/);
});

test('Windows MSVC setup handles spaces and exposes only compiler environment', {skip:process.platform!=='win32'},async()=>{
  const {mkdtempSync,mkdirSync,writeFileSync,rmSync}=await import('node:fs');
  const {tmpdir}=await import('node:os');
  const {join}=await import('node:path');
  const {msvcEnvironment}=await import('../scripts/msvc.mjs');
  const directory=mkdtempSync(join(tmpdir(),'moonmmdb-msvc-'));
  try {
    const nested=join(directory,'Visual Studio','Common7','Tools');mkdirSync(nested,{recursive:true});
    const batch=join(nested,'VsDevCmd.bat');
    writeFileSync(batch,'@echo off\r\nset "INCLUDE=C:\\msvc-test-include"\r\nset "MOONMMDB_TEST_PRIVATE=must-not-escape"\r\nexit /b 0\r\n');
    const env=msvcEnvironment(batch);
    assert.equal(env.INCLUDE,'C:\\msvc-test-include');
    assert.ok(!Object.hasOwn(env,'MOONMMDB_TEST_PRIVATE'));
    assert.ok(Object.keys(env).every(k=>/^(PATH|INCLUDE|LIB|LIBPATH|VCTOOLSINSTALLDIR|WINDOWSSDKDIR|WINDOWSSDKVERSION)$/.test(k)));
    assert.throws(()=>msvcEnvironment('C:/invalid&path/VsDevCmd.bat'),/Invalid MSVC setup path/);
  } finally {rmSync(directory,{recursive:true,force:true});}
});
