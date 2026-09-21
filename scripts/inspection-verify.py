"""Independent physical-tree oracle and real CLI network/validation checks.

No expected ranges are obtained from MoonMMDB. A small raw-format walker
enumerates physical paths, and pinned MaxMind Python supplies record values.
Hostile decode expectations reuse the pre-existing reviewed corpus policy.
"""
import argparse,datetime,hashlib,importlib.util,ipaddress,json,os,subprocess,sys,time,threading
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(ROOT/'.reference-deps'))
import maxminddb
assert maxminddb.__version__=='3.2.0'
p=argparse.ArgumentParser();p.add_argument('--native',action='store_true');p.add_argument('--production',action='store_true');args=p.parse_args()
exe=ROOT/'dist'/('moonmmdb.exe' if os.name=='nt' else 'moonmmdb')
command=[str(exe)] if args.native else ['node',str(ROOT/'bin/moonmmdb.mjs')]
out=ROOT/'verification/local'/('inspection-'+('native' if args.native else 'js')+('-production' if args.production else '')+'.json')
report={'status':'running','started':datetime.datetime.now(datetime.timezone.utc).isoformat(),'target':'native' if args.native else 'js','artifact_sha256':hashlib.sha256((exe if args.native else ROOT/'dist/core.mjs').read_bytes()).hexdigest(),'files':[],'network_checks':0}

def execute(*argv,timeout=180):
    r=subprocess.run(command+list(map(str,argv)),cwd=ROOT,capture_output=True,text=True,encoding='utf-8',timeout=timeout)
    assert r.returncode in (0,1,2),(argv,r.returncode,r.stderr)
    return r,[json.loads(line) for line in r.stdout.splitlines()],[json.loads(line) for line in r.stderr.splitlines()]

def plain(v):
    t,x=v['type'],v['value']
    if t=='map':return {k:plain(y) for k,y in x.items()}
    if t=='array':return [plain(y) for y in x]
    if t.startswith('uint') or t=='int32':return int(x)
    if t=='bytes':return bytes.fromhex(x)
    if t in ('float32','float64'):
        import struct
        return struct.unpack('>f' if t=='float32' else '>d',int(v['bits'],16).to_bytes(4 if t=='float32' else 8,'big'))[0]
    return x

def graph(path):
    raw=path.read_bytes()
    with maxminddb.open_database(str(path),maxminddb.MODE_MEMORY) as r:meta=r.metadata()
    n=meta.node_count;size=meta.record_size;end=raw.rfind(b'\xab\xcd\xefMaxMind.com');start=n*size//4
    assert 0<=n<=100000,'Fixture graph oracle has a finite node cap'
    assert start+16<=end and raw[start:start+16]==bytes(16),'Opening layout/separator rejection precedes traversal'
    def child(node,side):
        at=node*size//4
        if size==28:return ((raw[at+3]>>(4 if side==0 else 0))&15)<<24 | int.from_bytes(raw[at+side*4:at+side*4+3],'big')
        return int.from_bytes(raw[at+side*(size//8):at+(side+1)*(size//8)],'big')
    heights={};active=set();reachable=0
    for root in range(n):
        if root in heights:continue
        stack=[(root,False)]
        while stack:
            node,finish=stack.pop()
            if finish:
                heights[node]=1+max([heights[c] if c<n else 0 for c in (child(node,0),child(node,1))]);active.remove(node);continue
            if node in active:return meta,child,'tree-cycle'
            if node in heights:continue
            active.add(node);stack.append((node,True))
            for side in (1,0):
                c=child(node,side)
                if c<n:stack.append((c,False))
                elif c>n and (c-n<16 or start+c-n>=end):return meta,child,'invalid-tree-pointer'
        if root==0:
            reachable=len(heights)
            if heights[0]>(32 if meta.ip_version==4 else 128):return meta,child,'invalid-tree'
    return meta,child,{'checked_nodes':n,'reachable_nodes':reachable,'unreachable_nodes':n-reachable}

def ranges(meta,child):
    n=meta.node_count;bits=32 if meta.ip_version==4 else 128
    stack=[(0,0,0)];emitted=0
    while stack:
        node,depth,value=stack.pop()
        if node==n:continue
        if node>n:
            address=ipaddress.IPv4Address(value<<(bits-depth)) if bits==32 else ipaddress.IPv6Address(value<<(bits-depth))
            emitted+=1;assert emitted<=100000,'Fixture enumeration cap'
            yield ipaddress.ip_network(f'{address}/{depth}');continue
        assert depth<bits
        stack.extend([(child(node,1),depth+1,value*2+1),(child(node,0),depth+1,value*2)])

def check_networks(path,cidr,expected,reference):
    r,rows,errors=execute('networks',path,cidr)
    assert r.returncode==(0 if expected else 1),(path,cidr,r.stderr)
    assert len(rows)==len(expected),(path,cidr,len(rows),len(expected))
    for row,network in zip(rows,expected):
        assert ipaddress.ip_network(row['network'])==network,(path,row['network'],str(network))
        for ip in (network.network_address,network.broadcast_address):
            assert plain(row['value'])==reference.get(str(ip)),(path,str(ip))
            report['network_checks']+=1
    assert len(errors)==1 and errors[0]['status']=='summary' and errors[0]['records']==len(rows)

try:
    if args.production:
        for entry in json.loads((ROOT/'examples/production-many.json').read_text())['sources']:
            path=(ROOT/'examples'/entry['database']).resolve();started=time.monotonic()
            r,rows,_=execute('validate',path,'--decode-data','--max-work','1000000000',timeout=600)
            assert r.returncode==0 and rows[0]['status']=='valid',(path,rows)
            with maxminddb.open_database(str(path),maxminddb.MODE_MEMORY) as ref:
                assert rows[0]['checked_nodes']==ref.metadata().node_count
                # CIDRs fixed independently of implementation output. Include
                # IPv4/IPv6 aliases and empty/private address space.
                for text in ['1.1.1.0/24','8.8.8.0/24','81.2.69.0/24','10.0.0.0/24','192.0.2.0/24','2001:4860:4860::/112','2606:4700:4700::/112','::ffff:101:100/120']:
                    network=ipaddress.ip_network(text);lo=int(network.network_address);hi=int(network.broadcast_address);expected=[]
                    while lo<=hi:
                        ip=ipaddress.IPv4Address(lo) if network.version==4 else ipaddress.IPv6Address(lo)
                        value,prefix=ref.get_with_prefix_len(str(ip))
                        match=ipaddress.ip_network(f'{ip}/{prefix}',strict=False)
                        end=min(hi,int(match.broadcast_address))
                        if value is not None:
                            expected.extend(ipaddress.summarize_address_range(ip,type(ip)(end)))
                        lo=end+1
                        assert len(expected)<=100000
                    check_networks(path,text,expected,ref)
                    # Independently check both outside boundaries as well.
                    for number in (int(network.network_address)-1,int(network.broadcast_address)+1):
                        if 0<=number<(1<<network.max_prefixlen):
                            ip=type(network.network_address)(number)
                            q,values,_=execute('lookup',path,str(ip));want=ref.get(str(ip))
                            assert q.returncode==(0 if want is not None else 1)
                            if want is not None:assert plain(values[0]['record'])==want
                            report['network_checks']+=1
            report['files'].append({'file':path.name,'seconds':time.monotonic()-started,**rows[0]})
    else:
        manifest=json.loads((ROOT/'tests/fixtures/corpus.json').read_text())
        assert len(manifest['files'])==73
        for entry in manifest['files']:
            path=ROOT/'tests/fixtures'/entry['path'];assert hashlib.sha256(path.read_bytes()).hexdigest()==entry['sha256']
            r,rows,errors=execute('validate',path,'--decode-data')
            assert len(rows)==1 and not errors,(entry['path'],rows,errors)
            result=rows[0];expected=entry.get('expected_code')
            if entry['mode']=='policy':
                # Structural checking may find an earlier, independently
                # identifiable tree error before the established decode policy.
                try: _,_,tree=graph(path)
                except Exception:tree=None
                if isinstance(tree,str):expected=tree
                assert result.get('code')==expected,(entry['path'],expected,result)
                assert r.returncode==(2 if expected else 0)
                ip=entry.get('ip','1.1.1.1');cidr=ip+('/128' if ':' in ip else '/32')
                nr,nrows,ne=execute('networks',path,cidr)
                if expected:assert nr.returncode==2 and ne and ne[-1]['status']=='error' and not any(e['status']=='summary' for e in ne),(entry['path'],nr.returncode,nrows,ne)
                else:assert nr.returncode in (0,1) and ne[-1]['status']=='summary'
            else:
                meta,child,tree=graph(path)
                if isinstance(tree,str):
                    assert result.get('code')==tree,(path,tree,result)
                else:
                    assert r.returncode==0 and result['status']=='valid',(path,result)
                    for key,value in tree.items():assert result[key]==value
                    with maxminddb.open_database(str(path),maxminddb.MODE_MEMORY) as ref:
                        expected_ranges=list(ranges(meta,child))
                        check_networks(path,'0.0.0.0/0' if meta.ip_version==4 else '::/0',expected_ranges,ref)
            report['files'].append({'file':entry['source_path'],'validation_status':result['status'],'code':result.get('code'),'expected_policy':expected})
        # A mathematical 65536-record oracle, not the product under test.
        spec=importlib.util.spec_from_file_location('scale',ROOT/'scripts/scale-verify.py');scale=importlib.util.module_from_spec(spec);spec.loader.exec_module(scale)
        path=ROOT/'verification/local/synthetic-scale.mmdb'
        if not path.exists():path.write_bytes(scale.generate())
        child=subprocess.Popen(command+['networks',str(path),'0.0.0.0/0'],stdout=subprocess.PIPE,stderr=subprocess.PIPE,cwd=ROOT)
        timer=threading.Timer(180,child.kill);timer.start()
        try:
            count=0
            for line in child.stdout:
                row=json.loads(line);assert row['network']==str(ipaddress.ip_network((count<<16,16)))
                assert plain(row['value'])==scale.expected_record(count)
                count+=1
            diagnostics=child.stderr.read();assert child.wait()==0 and count==65536,(count,diagnostics)
            assert json.loads(diagnostics)['records']==count
            report['synthetic_networks']=count
        finally:timer.cancel();child.stdout.close();child.stderr.close();child.wait()
    report['status']='passed'
except Exception as e:report.update(status='failed',error=str(e));raise
finally:
    report['finished']=datetime.datetime.now(datetime.timezone.utc).isoformat();out.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps({'status':report['status'],'files':len(report['files']),'network_checks':report['network_checks'],'error':report.get('error')}),flush=True)
