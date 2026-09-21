import {readFileSync} from 'node:fs';
import {summarize} from '../examples/typed_consumer/_build/js/release/build/local/moonmmdb_typed_example/moonmmdb_typed_example.js';
const request=JSON.parse(readFileSync(0,'utf8'));
process.stdout.write(summarize(readFileSync(request.file),request.ips,request.kind,request.locale));
