// Only the process-local developer environment is changed. No system settings.
import {existsSync} from 'node:fs';
import {resolve,dirname,basename} from 'node:path';
import {spawnSync} from 'node:child_process';

export function assertMsvcName(compiler) {
  if(!/^(cl|clang-cl)(\.exe)?$/i.test(basename(compiler.replaceAll('\\','/'))))throw new Error('Current MoonBit on Windows requires MSVC cl.exe or clang-cl.exe and the Windows SDK; MinGW is not supported.');
}
// cmd.exe needs its quoted /c payload verbatim when the VS path contains spaces.
export function msvcEnvironment(batch) {
  if(/["%&|<>\r\n]/.test(batch))throw new Error('Invalid MSVC setup path.');
  const dev=spawnSync('cmd.exe',['/d','/s','/c',`""${batch}" -no_logo -arch=amd64 -host_arch=amd64 >nul && set"`],{encoding:'utf8',windowsVerbatimArguments:true});
  if(dev.status!==0)throw new Error('Unable to initialize the x64 MSVC developer environment.');
  const result={};
  // Never return or print the full captured environment: it can contain credentials.
  for(const line of dev.stdout.split(/\r?\n/)) {
    const match=line.match(/^([^=]+)=(.*)$/);
    if(match&&/^(path|include|lib|libpath|vctoolsinstalldir|windowssdkdir|windowssdkversion)$/i.test(match[1]))result[match[1].toUpperCase()]=match[2];
  }
  return result;
}
export function configureMsvc() {
  let compiler=process.env.MOON_CC;
  if(compiler)assertMsvcName(compiler);
  else {
    const probe=spawnSync('where.exe',['cl.exe'],{encoding:'utf8'});
    compiler=probe.status===0?probe.stdout.trim().split(/\r?\n/)[0]:null;
    if(!compiler) {
      const vswhere=resolve(process.env['ProgramFiles(x86)']||'C:/Program Files (x86)','Microsoft Visual Studio/Installer/vswhere.exe');
      if(!existsSync(vswhere))throw new Error('Install Visual Studio C++ Build Tools and the Windows SDK, or run in an x64 Developer PowerShell with MOON_CC set to cl.exe.');
      const located=spawnSync(vswhere,['-latest','-products','*','-requires','Microsoft.VisualStudio.Component.VC.Tools.x86.x64','-property','installationPath'],{encoding:'utf8'});
      const home=located.stdout?.trim();
      if(located.status!==0||!home||/["%&|<>\r\n]/.test(home))throw new Error('No usable Visual Studio C++ Build Tools installation found.');
      const bat=resolve(home,'Common7/Tools/VsDevCmd.bat');
      for(const [key,value] of Object.entries(msvcEnvironment(bat))) {
        for(const old of Object.keys(process.env))if(old.toUpperCase()===key)delete process.env[old];
        process.env[key]=value;
      }
      const found=spawnSync('where.exe',['cl.exe'],{encoding:'utf8'});
      if(found.status!==0)throw new Error('MSVC environment did not provide cl.exe.');
      compiler=found.stdout.trim().split(/\r?\n/)[0];
    }
  }
  assertMsvcName(compiler);
  const version=spawnSync(compiler,/clang-cl/i.test(compiler)?['--version']:[],{encoding:'utf8'});
  const banner=(version.stdout||'')+(version.stderr||'');
  if(version.error||![0,2].includes(version.status)||!/Microsoft.*C\/C\+\+|clang version/i.test(banner))throw new Error('Cannot execute the configured MSVC-compatible compiler.');
  process.env.MOON_CC=compiler;
  if(!process.env.MOON_AR&&existsSync(resolve(dirname(compiler),'lib.exe')))process.env.MOON_AR=resolve(dirname(compiler),'lib.exe');
  return {compiler,version:banner.trim(),family:'msvc-compatible',runtime_modified:false};
}
