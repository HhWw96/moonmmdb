"""Browser expectations from pinned Python, raw tree inspection and reviewed policy.
No expected query value comes from the MoonBit implementation.
"""
import base64, hashlib, importlib.util, json, pickle, struct, subprocess, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(ROOT/'.reference-deps'))
import maxminddb
assert maxminddb.__version__=='3.2.0'
def normalize(v):
    if isinstance(v,bool) or v is None or isinstance(v,str):return v
    if isinstance(v,int):return {'$integer':str(v)}
    if isinstance(v,float):return {'$float':struct.pack('>d',v).hex()}
    if isinstance(v,bytes):return {'$bytes':v.hex()}
    if isinstance(v,list):return [normalize(x) for x in v]
    return {k:normalize(x) for k,x in v.items()}
def tree_error(path):
    raw=path.read_bytes()
    with maxminddb.open_database(str(path),maxminddb.MODE_MEMORY) as db:m=db.metadata()
    n=m.node_count; size=m.record_size; start=n*size//4; end=raw.rfind(b'\xab\xcd\xefMaxMind.com')
    assert n<=100000 and start+16<=end and raw[start:start+16]==bytes(16)
    def child(node,side):
        at=node*size//4
        if size==28:return ((raw[at+3]>>(4 if side==0 else 0))&15)<<24|int.from_bytes(raw[at+side*4:at+side*4+3],'big')
        return int.from_bytes(raw[at+side*(size//8):at+(side+1)*(size//8)],'big')
    heights={}; active=set()
    for root in range(n):
        if root in heights:continue
        stack=[(root,False)]
        while stack:
            node,done=stack.pop()
            if done:
                heights[node]=1+max(heights[c] if c<n else 0 for c in (child(node,0),child(node,1)));active.remove(node);continue
            if node in active:return 'tree-cycle'
            if node in heights:continue
            active.add(node);stack.append((node,True))
            for side in (1,0):
                c=child(node,side)
                if c<n:stack.append((c,False))
                elif c>n and (c-n<16 or start+c-n>=end):return 'invalid-tree-pointer'
        if root==0 and heights[0]>(32 if m.ip_version==4 else 128):return 'invalid-tree'
    return None
manifest=json.loads((ROOT/'tests/fixtures/corpus.json').read_text())
output={'reference':'maxminddb 3.2.0 MODE_MEMORY; raw physical tree; pinned policy','files':[]}
for index,entry in enumerate(manifest['files']):
    path=ROOT/'tests/fixtures'/entry['path']
    assert hashlib.sha256(path.read_bytes()).hexdigest()==entry['sha256']
    item={'file':str(path.relative_to(ROOT)).replace('\\','/'),'sha256':entry['sha256'],'mode':entry['mode'],'validation_code':entry.get('expected_code'),'queries':[]}
    try:item['validation_code']=tree_error(path) or item['validation_code']
    except Exception:pass # Invalid opening is separately checked against the reviewed policy.
    if entry['mode']=='reference':
        run=subprocess.run([sys.executable,'-X','utf8',str(ROOT/'scripts/corpus-verify.py'),'--oracle',str(index)],capture_output=True,check=True,timeout=30)
        oracle=pickle.loads(base64.b64decode(run.stdout)) # Locally generated oracle payload only.
        item['metadata']=oracle['metadata']
        item['queries']=[{'ip':ip,'prefix':prefix,'record':normalize(record)} for ip,(record,prefix) in oracle['queries']]
    else:item.update(ip=entry['ip'],query_code=entry['expected_code'])
    output['files'].append(item)
if '--production' in sys.argv:
    spec=importlib.util.spec_from_file_location('production',ROOT/'scripts/production-verify.py');helper=importlib.util.module_from_spec(spec);spec.loader.exec_module(helper)
    sources=[s for s in json.loads((ROOT/'verification/production-sources.json').read_text()) if 'city' in s['file'] or 'asn' in s['file']]
    ips=set()
    for source in sources:
        path=ROOT/'verification/local/production'/source['file'];assert hashlib.sha256(path.read_bytes()).hexdigest()==source['sha256']
        with maxminddb.open_database(str(path),maxminddb.MODE_MEMORY) as db:ips.update(helper.addresses(db))
    assert len(ips)==7114
    for source in sources:
        path=ROOT/'verification/local/production'/source['file']
        with maxminddb.open_database(str(path),maxminddb.MODE_MEMORY) as db:
            output['files'].append({'file':str(path.relative_to(ROOT)).replace('\\','/'),'sha256':source['sha256'],'mode':'production','validation_code':None,'nodes':db.metadata().node_count,'queries':[{'ip':ip,'prefix':prefix,'record':normalize(record)} for ip in sorted(ips) for record,prefix in [db.get_with_prefix_len(ip)]]})
out=ROOT/'verification/local/browser-oracle.json';out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(output,ensure_ascii=True,separators=(',',':'))+'\n')
spec=importlib.util.spec_from_file_location('inspection_fixtures',ROOT/'scripts/inspection-fixtures.py');fixtures=importlib.util.module_from_spec(spec);spec.loader.exec_module(fixtures)
for name,value in [('browser-preview','界'*100000),('browser-result-limit','\x00'*1500000),('browser-html','<img src=x onerror="alert(1)"><script>throw 1</script>')]:
    (out.parent/(name+'.mmdb')).write_bytes(fixtures.database([(17,1)],fixtures.s.text(value)))
print(json.dumps({'files':len(output['files']),'queries':sum(len(e['queries']) for e in output['files']),'bytes':out.stat().st_size}))
