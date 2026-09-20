// I/O adapter only. Queries, grouping, counters and sorting are compiled MoonBit.
import {create_analytics,analytics_push,analytics_invalid,analytics_status,analytics_result} from '../../dist/analytics.mjs';
import {readFileBounded} from '../../bin/many.mjs';
import {streamOptions,inputSelector,openInput,boundedLines} from '../../bin/jsonl.mjs';
import {prepare_fields,selection_status} from '../../dist/core.mjs';
process.stdout.on('error',()=>{});process.stderr.on('error',()=>{});
const write=(text,stream=process.stdout)=>new Promise((resolve,reject)=>stream.write(text+'\n',error=>error?reject(error):resolve()));
try {
  const [geo,asn,input,...flags]=process.argv.slice(2);
  if(!geo||!asn||!input) throw new Error('Usage: node examples/log_analytics/run.mjs CITY.mmdb ASN.mmdb INPUT.jsonl|- [stream options]');
  const options=streamOptions(flags);
  if(options.paths.length) throw new Error('Analysis selects country and ASN fields; --field is not supported');
  const check=JSON.parse(selection_status(prepare_fields([options.ipPath])));
  if(check.status==='error') throw new Error(check.message);
  const select=inputSelector(options.ipPath);
  const geoBytes=readFileBounded(geo,268435456);
  const asnBytes=readFileBounded(asn,268435456-geoBytes.length);
  const state=create_analytics(geoBytes,asnBytes);
  let status=JSON.parse(analytics_status(state));
  if(status.status==='error') {await write(JSON.stringify(status));process.exitCode=2;}
  else {
    for await(const {text} of boundedLines(openInput(input,options.maxBytes),options)) {
      let ip;
      try {const row=JSON.parse(text); if(!row||typeof row!=='object'||Array.isArray(row)||typeof(ip=select(row))!=='string') throw new Error('Invalid row');}
      catch {analytics_invalid(state);continue;}
      analytics_push(state,ip);
      status=JSON.parse(analytics_status(state));
      if(status.status==='error') break;
    }
    const result=JSON.parse(analytics_result(state));
    await write(JSON.stringify(result));process.exitCode=result.status==='error'?2:result.exit_code;
  }
} catch(error) {process.exitCode=2;await write(JSON.stringify({status:'error',code:error.code||'host-input-error',message:error.message}),process.stderr).catch(()=>{});}
