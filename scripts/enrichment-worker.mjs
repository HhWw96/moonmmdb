import {readFileSync} from 'node:fs';
import {loadMany} from '../bin/many.mjs';
import {enrich_ip} from '../dist/core.mjs';
const {config,ips}=JSON.parse(readFileSync(0,'utf8'));
const {handle}=loadMany(config);
for(const ip of ips) process.stdout.write(enrich_ip(handle,ip)+'\n');
