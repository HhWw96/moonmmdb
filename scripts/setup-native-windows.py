"""Provision a pinned, workspace-local GCC verification toolchain; no system install."""
import hashlib,json,os,subprocess,urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/'verification/local/toolchains'
if os.name!='nt':raise SystemExit('This helper provisions Windows x64 only; use MOON_CC on other systems.')
OUT.mkdir(parents=True,exist_ok=True)
assets=[
 ('w64devkit-x64-2.10.0.7z.exe','https://api.github.com/repos/skeeto/w64devkit/releases/assets/562510315','18d0a4c71a166f8401ab6305781bec5882b40b5e06ba9807c61cb5f3b3c6325e'),
 ('7zr.exe','https://github.com/ip7z/7zip/releases/download/26.03/7zr.exe','ad4c82fadcbdf93c03b4fc440f300509c7d60c5c2f4d183e35d9d70d6957037d'),
]
for name,url,expected in assets:
    path=OUT/name
    if not path.exists():
        temp=path.with_suffix(path.suffix+'.part')
        request=urllib.request.Request(url,headers={'User-Agent':'MoonMMDB verification','Accept':'application/octet-stream'})
        with urllib.request.urlopen(request,timeout=60) as response,temp.open('wb') as file:
            while chunk:=response.read(262144):file.write(chunk)
        if hashlib.sha256(temp.read_bytes()).hexdigest()!=expected:raise RuntimeError('Download hash mismatch: '+name)
        temp.replace(path)
    if hashlib.sha256(path.read_bytes()).hexdigest()!=expected:raise RuntimeError('Cached toolchain hash mismatch: '+name)
compiler=OUT/'extracted/w64devkit/bin/gcc.exe'
if not compiler.exists():
    # Only this fixed upstream archive/hash is accepted, not arbitrary ZIP/7z input.
    run=subprocess.run([str(OUT/'7zr.exe'),'x',str(OUT/assets[0][0]),'-o'+str(OUT/'extracted'),'-y'],cwd=ROOT,timeout=180)
    if run.returncode:raise RuntimeError('Pinned compiler extraction failed')
version=subprocess.check_output([str(compiler),'--version'],text=True,encoding='utf-8')
report={'source':'https://github.com/skeeto/w64devkit/releases/tag/v2.10.0','archive_sha256':assets[0][2],'compiler_sha256':hashlib.sha256(compiler.read_bytes()).hexdigest(),'compiler':str(compiler),'version':version,'scope':'Workspace-local portable tools. No registry, global PATH or MoonBit runtime modifications.','note':'Pinned MoonBit 0.10.11 verification with MinGW compatibility launcher; does not certify current MoonBit MSVC ABI/toolchain support.'}
(OUT/'provenance.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
print(version)
