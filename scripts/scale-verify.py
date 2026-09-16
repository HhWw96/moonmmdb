"""Reproducible synthetic /16 corpus, independently checked with MaxMind Python.

This small test-only encoder supports exactly this corpus, not a public MMDB writer.
It is independent of the MoonBit decoder; the reference reader and mathematical
/16 record identity both have to agree with the actual compiled MoonBit output.
"""
import datetime, hashlib, ipaddress, json, os, platform, random, subprocess, sys
from pathlib import Path

ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/'verification/local/scale.json'
sys.path.insert(0,str(ROOT/'.reference-deps'))

def field(kind,payload=b'',size=None):
    size=len(payload) if size is None else size
    if size<29: low,extra=size,b''
    elif size<285: low,extra=29,bytes([size-29])
    elif size<65821: low,extra=30,(size-285).to_bytes(2,'big')
    else: low,extra=31,(size-65821).to_bytes(3,'big')
    control=bytes([((kind if kind<8 else 0)<<5)|low])
    return control+(bytes([kind-7]) if kind>=8 else b'')+extra+payload

def text(value): return field(2,value.encode('utf-8'))
def integer(kind,value): return field(kind,value.to_bytes((value.bit_length()+7)//8,'big'))
def mapping(items): return field(7,b''.join(text(k)+v for k,v in items),len(items))

def expected_record(n):
    return {'subnet_id':n,'label':f'synthetic-{n:05d}-'+'x'*384,'counter':(1<<127)+n,'nested':{'enabled':bool(n%2)}}

def generate():
    count=65535
    data=bytearray()
    offsets=[]
    for n in range(65536):
        offsets.append(len(data))
        record=expected_record(n)
        data.extend(mapping([('subnet_id',integer(6,n)),('label',text(record['label'])),('counter',integer(10,record['counter'])),('nested',mapping([('enabled',field(14,size=n%2))]))]))
    tree=bytearray()
    for node in range(count):
        pair=[]
        for child in (node*2+1,node*2+2):
            pair.append(child if child<count else count+16+offsets[child-count])
        left,right=pair
        assert max(pair)<(1<<28)
        tree.extend((left&0xffffff).to_bytes(3,'big')+bytes([((left>>24)<<4)|(right>>24)])+(right&0xffffff).to_bytes(3,'big'))
    metadata=mapping([('node_count',integer(6,count)),('record_size',integer(5,28)),('ip_version',integer(5,4)),('database_type',text('MoonMMDB-Synthetic-Scale')),('binary_format_major_version',integer(5,2)),('binary_format_minor_version',integer(5,0)),('build_epoch',integer(9,0)),('languages',field(11,text('en'),1)),('description',mapping([('en',text('Deterministic synthetic corpus; not geolocation data'))]))])
    return bytes(tree)+bytes(16)+data+b'\xab\xcd\xefMaxMind.com'+metadata

def plain(tag):
    kind,value=tag['type'],tag['value']
    if kind.startswith('uint') or kind=='int32': return int(value)
    if kind=='map': return {k:plain(v) for k,v in value.items()}
    if kind=='array': return [plain(v) for v in value]
    return value

def main(report):
    import maxminddb
    if maxminddb.__version__!='3.2.0': raise RuntimeError('Requires pinned maxminddb==3.2.0')
    data=generate()
    file=OUT.parent/'synthetic-scale.mmdb'
    file.write_bytes(data)
    rng=random.Random(0x5343414c)
    # Both sides of selected /16 boundaries, unsigned address extremes, random IPs.
    numbers={0,0xffffffff}
    for n in (1,127,128,255,256,32767,32768,65535): numbers.update([n<<16,(n<<16)-1])
    while len(numbers)<5000: numbers.add(rng.getrandbits(32))
    ips=[str(ipaddress.IPv4Address(n)) for n in sorted(numbers)]
    expectations=[]
    with maxminddb.open_database(str(file),maxminddb.MODE_MEMORY) as ref:
        for ip in ips:
            got,prefix=ref.get_with_prefix_len(ip)
            expected=expected_record(int(ipaddress.IPv4Address(ip))>>16)
            if got!=expected or prefix!=16: raise RuntimeError('Synthetic generator/reference disagreement: '+ip)
            expectations.append(got)
    run=subprocess.run([os.environ.get('NODE','node'),'scripts/scale-worker.mjs'],cwd=ROOT,input=json.dumps({'file':str(file),'ips':ips}),capture_output=True,text=True,encoding='utf-8',timeout=60)
    if run.returncode: raise RuntimeError(run.stderr)
    actual=json.loads(run.stdout)
    rows=actual.pop('rows')
    if len(rows)!=len(ips): raise RuntimeError('Scale response count mismatch')
    failures=[]
    for ip,expected,got in zip(ips,expectations,rows):
        if got.get('status')!='found' or got.get('prefix_length')!=16 or plain(got['record'])!=expected: failures.append({'ip':ip,'actual':got})
    report.update(status='failed' if failures else 'passed',database_bytes=len(data),database_sha256=hashlib.sha256(data).hexdigest(),networks=65536,record_size=28,checks=len(ips),reference='maxminddb 3.2.0 pure Python plus mathematical /16 identity',seed='0x5343414c',conditions={'platform':platform.platform(),'python':platform.python_version(),'node':subprocess.check_output(['node','--version'],text=True).strip(),'warmup_queries':200,'measurement':'MoonBit lookup plus typed JSON serialization and host JSON parsing; result rows retained for comparison','limits':'Synthetic records, not real geolocation accuracy or production workload; RSS includes retained results and input snapshot.'},failure_count=len(failures),failures=failures[:10],measurement=actual)
    if failures: raise RuntimeError('Scale comparison failed')

if __name__=='__main__':
    OUT.parent.mkdir(parents=True,exist_ok=True)
    report={'started':datetime.datetime.now(datetime.timezone.utc).isoformat(),'status':'running'}
    OUT.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    try: main(report)
    except Exception as error:
        report.update(status='failed',error=str(error));raise
    finally:
        report['finished']=datetime.datetime.now(datetime.timezone.utc).isoformat()
        OUT.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        print(json.dumps(report,ensure_ascii=True))
