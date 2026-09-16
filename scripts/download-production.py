"""Fetch pinned DB-IP Lite snapshots; preserve attribution and verify every byte."""
import gzip,hashlib,json,urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
out=ROOT/'verification/local/production'
out.mkdir(parents=True,exist_ok=True)
for source in json.loads((ROOT/'verification/production-sources.json').read_text(encoding='utf-8')):
    target=out/source['file']
    if target.exists() and hashlib.sha256(target.read_bytes()).hexdigest()==source['sha256']:
        print('Verified existing '+target.name,flush=True);continue
    compressed=out/(target.name+'.gz')
    if not compressed.exists() or hashlib.sha256(compressed.read_bytes()).hexdigest()!=source['gzip_sha256']:
        temporary=compressed.with_suffix(compressed.suffix+'.part')
        with urllib.request.urlopen(source['url'],timeout=60) as response,temporary.open('wb') as file:
            while chunk:=response.read(262144):file.write(chunk)
        if hashlib.sha256(temporary.read_bytes()).hexdigest()!=source['gzip_sha256']:raise RuntimeError('Compressed SHA-256 mismatch: '+target.name)
        temporary.replace(compressed)
    temporary=target.with_suffix(target.suffix+'.part')
    with gzip.open(compressed,'rb') as response,temporary.open('wb') as file:
        while chunk:=response.read(262144):file.write(chunk)
    if hashlib.sha256(temporary.read_bytes()).hexdigest()!=source['sha256']:raise RuntimeError('MMDB SHA-256 mismatch: '+target.name)
    temporary.replace(target)
    print('Verified '+target.name+'; IP Geolocation by DB-IP https://db-ip.com/ (CC BY 4.0)',flush=True)
