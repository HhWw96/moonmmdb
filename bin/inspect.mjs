// Host I/O only: all tree walking, decoding and validation run in MoonBit.
import {openSync,fstatSync,readSync,closeSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {open_database,metadata,prepare_networks,next_network,network_stats,close_networks,validate_database} from '../dist/core.mjs';

function readDatabase(path) {
  const fd=openSync(path,'r');
  try {
    const stat=fstatSync(fd);
    if(!stat.isFile()||stat.size>268435456)throw Object.assign(new Error('Expected regular database file <=256 MiB'),{code:'file-limit'});
    const bytes=Buffer.alloc(stat.size);
    for(let offset=0;offset<bytes.length;) {
      const size=readSync(fd,bytes,offset,bytes.length-offset,offset);
      if(!size)throw new Error('Database truncated during read');
      offset+=size;
    }
    return bytes;
  } finally { closeSync(fd); }
}

export async function inspect(command,args,write) {
  const emit=(value,diagnostic=false)=>write(JSON.stringify(value)+'\n',diagnostic?process.stderr:process.stdout);
  try {
    const database=args[0],cidr=command==='networks'?args[1]:null;
    if(!database||(command==='networks'&&!cidr))throw new Error('Expected database and CIDR; use --help');
    let maxRecords=100000,maxWork=100000000,maxState=67108864,decode=false;
    const seen=new Set();
    for(let i=command==='networks'?2:1;i<args.length;i++) {
      const key=args[i];
      if(seen.has(key))throw new Error('Duplicate option: '+key);
      seen.add(key);
      if(key==='--decode-data'&&command==='validate'){decode=true;continue;}
      const cap=key==='--max-work'?1000000000:key==='--max-records'&&command==='networks'?1000000:key==='--max-state-bytes'&&command==='validate'?268435456:0;
      if(!cap||!(/^[1-9][0-9]*$/).test(args[i+1]||''))throw new Error('Invalid option: '+key);
      const value=Number(args[++i]);
      if(!Number.isSafeInteger(value)||value>cap)throw new Error('Option exceeds supported limit: '+key);
      if(key==='--max-work')maxWork=value;else if(key==='--max-records')maxRecords=value;else maxState=value;
    }
    const bytes=readDatabase(database),reader=open_database(bytes),info=JSON.parse(metadata(reader));
    if(info.status==='error') {
      if(command==='validate')info.status=['work-limit','state-limit','depth-limit','value-limit','payload-limit','file-limit'].includes(info.code)?'incomplete':'invalid';
      await emit(info,command!=='validate');return 2;
    }
    const raw=info.metadata.value;
    const provenance={sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,database_type:raw.database_type.value,build_epoch:raw.build_epoch.value};
    if(command==='validate') {
      const report=JSON.parse(validate_database(reader,decode,maxWork,maxState));
      await emit({...report,...provenance});return report.status==='valid'?0:2;
    }
    const cursor=prepare_networks(reader,cidr,maxRecords,maxWork);
    try {
      for(;;) {
        const record=JSON.parse(next_network(cursor));
        if(record.status==='error'){await emit(record,true);return 2;}
        if(record.status==='end')break;
        await emit(record);
      }
      const stats=JSON.parse(network_stats(cursor));
      await emit({status:'summary',scope:cidr,...stats,...provenance},true);
      return stats.records?0:1;
    } finally { close_networks(cursor); }
  } catch(error) {
    try { await emit({status:'error',code:error.constructor.name==='OutputError'?'host-output-error':error.code==='file-limit'?'file-limit':'host-input-error',message:error.message},true); } catch {}
    return 2;
  }
}
