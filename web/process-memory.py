"""Sample the isolated browser process tree, never unrelated browser processes."""
import json,sys,psutil
root=psutil.Process(int(sys.argv[1]));rows=[]
for process in [root,*root.children(recursive=True)]:
    try:
        m=process.memory_info();row={'pid':process.pid,'rss':m.rss}
        if hasattr(m,'private'):row['private']=m.private
        rows.append(row)
    except (psutil.NoSuchProcess,psutil.AccessDenied):continue
assert rows,'No observable browser processes'
print(json.dumps({'rss':sum(r['rss'] for r in rows),'private':sum(r['private'] for r in rows) if all('private' in r for r in rows) else None,'processes':rows}))
