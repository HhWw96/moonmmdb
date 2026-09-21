"""Render published Native soak reports. Optional plotting dependency: matplotlib 3.11.2."""
import argparse,json,os,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
local=ROOT/'verification/local/plot-deps'
if local.exists():sys.path.insert(0,str(local))
os.environ.setdefault('MPLCONFIGDIR',str(ROOT/'verification/local/plot-cache'))
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
p=argparse.ArgumentParser();p.add_argument('--windows',type=Path,required=True);p.add_argument('--linux',type=Path);p.add_argument('--output',type=Path,default=ROOT/'docs/NATIVE_SOAK_0_5.png');args=p.parse_args()
inputs=[('Windows x64',args.windows)]+([('Linux x64',args.linux)] if args.linux else [])
reports=[(name,json.loads(path.read_text(encoding='utf-8'))) for name,path in inputs]
assert all(data['status']=='passed' and data['elapsed_seconds']>=1800 for _,data in reports)
fig,axes=plt.subplots(1,len(reports),figsize=(13 if len(reports)>1 else 8,5.5),squeeze=False)
colors={'rss':'#276FBF','private_bytes':'#D46A20','rss_high_water':'#77808A'}
for ax,(name,data) in zip(axes[0],reports):
 samples=data['samples'];x=[s['seconds']/60 for s in samples]
 for key,label in [('rss','Resident set (RSS)'),('private_bytes','Private Bytes' if name.startswith('Windows') else 'Anonymous RSS'),('rss_high_water','OS RSS high-water (observed)')]:
  if key not in samples[0]:continue
  ax.plot(x,[s[key]/1048576 for s in samples],label=label,color=colors[key],linewidth=1.8,linestyle='--' if key=='rss_high_water' else '-')
 ax.axvspan(0,5,color='#E9EEF3',alpha=.8,zorder=-1)
 ax.set_title(f"{name} | {data['rows']:,} rows",fontsize=12,fontweight='bold')
 ax.set(xlim=(0,30),ylim=(0,None),xlabel='Elapsed time (minutes)',ylabel='Memory (MiB)')
 ax.set_xticks(range(0,31,5));ax.grid(axis='y',color='#DCE1E7',linewidth=.6)
 ax.spines[['top','right']].set_visible(False);ax.legend(loc='best',fontsize=8.5,frameon=False)
fig.suptitle('MoonMMDB Native: 30-minute JSONL stability',fontsize=16,fontweight='bold',y=.97)
fig.text(.06,.10,'City + ASN; input capped at 500 rows/s; continuously drained output. Shading: 5-minute warmup.',fontsize=9)
note='30-second samples. Windows Private Bytes and Linux RssAnon are distinct metrics; not a memory ranking.' if args.linux else '30-second samples. Private Bytes includes non-resident allocations; RSS measures resident pages.'
fig.text(.06,.06,note,fontsize=9)
fig.subplots_adjust(left=.075,right=.97,bottom=.23,top=.84,wspace=.25)
args.output.parent.mkdir(parents=True,exist_ok=True);fig.savefig(args.output,dpi=180,facecolor='white');plt.close(fig)
print(args.output)
