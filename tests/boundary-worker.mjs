import {readFileSync} from 'node:fs';
import {open_database,metadata,lookup,project} from '../dist/core.mjs';
const h = open_database(readFileSync(process.argv[2]));
const m = JSON.parse(metadata(h));
const q = m.status === 'error' ? m : JSON.parse(lookup(h,process.argv[3]));
const p = m.status === 'error' ? m : JSON.parse(project(h,process.argv[3],['/absent']));
process.stdout.write(JSON.stringify({status:q.status,code:q.code,projection_status:p.status,projection_code:p.code,epoch:m.metadata?.value.build_epoch.value}));
