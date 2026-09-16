import { readFileSync } from 'node:fs';
import { open_database, metadata, lookup } from '../dist/core.mjs';
const handle = open_database(readFileSync(process.argv[2]));
const opened = JSON.parse(metadata(handle));
const result = opened.status === 'error' ? opened : JSON.parse(lookup(handle, '1.1.1.1'));
process.stdout.write(JSON.stringify(result));
