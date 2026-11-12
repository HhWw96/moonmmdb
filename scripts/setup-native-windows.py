"""Discover the official Windows MSVC toolchain; no global install or downloads."""
import json,os,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
if os.name!='nt':raise SystemExit('Windows x64 only; use the system C compiler on Linux.')
script="import {configureMsvc} from './scripts/msvc.mjs';console.log(JSON.stringify(configureMsvc()));"
run=subprocess.run(['node','--input-type=module','-e',script],cwd=ROOT,capture_output=True,text=True,encoding='utf-8')
if run.returncode:raise SystemExit(run.stderr)
report=json.loads(run.stdout)
report['scope']='Installed MSVC discovery. No registry, global PATH or MoonBit runtime modifications.'
OUT=ROOT/'verification/local/toolchains';OUT.mkdir(parents=True,exist_ok=True)
(OUT/'provenance.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
print(json.dumps(report))
