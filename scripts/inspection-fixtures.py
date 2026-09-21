"""Deterministic artificial fixtures, not real geolocation or a public writer."""
import importlib.util
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
spec=importlib.util.spec_from_file_location('scale',ROOT/'scripts/scale-verify.py');s=importlib.util.module_from_spec(spec);spec.loader.exec_module(s)
def database(edges,payload):
    tree=b''.join(a.to_bytes(3,'big')+b.to_bytes(3,'big') for a,b in edges)
    meta=s.mapping([('node_count',s.integer(6,len(edges))),('record_size',s.integer(5,24)),('ip_version',s.integer(5,4)),('database_type',s.text('MoonMMDB-Artificial-Inspection')),('binary_format_major_version',s.integer(5,2)),('binary_format_minor_version',s.integer(5,0)),('build_epoch',s.integer(9,0))])
    return tree+bytes(16)+payload+b'\xab\xcd\xefMaxMind.com'+meta
def main():
    out=ROOT/'verification/local';out.mkdir(parents=True,exist_ok=True)
    n=131071
    edges=[tuple(c if c<n else n+16 for c in (2*i+1,2*i+2)) for i in range(n)]
    (out/'inspection-stream.mmdb').write_bytes(database(edges,s.text('artificial-stream')))
    # Root hit, with an unreferenced second node pointing into the separator.
    (out/'inspection-hidden-corruption.mmdb').write_bytes(database([(18,2),(3,2)],s.text('artificial-orphan')))
if __name__=='__main__':main()
