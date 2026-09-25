// A clean consumer resolves exclusively from Mooncakes, with no moon.work.
import {mkdtempSync,copyFileSync,writeFileSync,readFileSync,existsSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {root,runMoon} from './moon.mjs';
import {sha256} from './evidence.mjs';
import {VERSION, capabilities} from './version.mjs';
const version=process.argv[2] || VERSION;
const features=capabilities(version);

const directory=mkdtempSync(resolve(tmpdir(),'moonmmdb-registry-'));
const report={started:new Date().toISOString(),status:'running',module:'HhWw96/moonmmdb',version,directory,scope:'New standalone consumer; no workspace dependency; registry download and version assertion.',steps:[]};
const output=resolve(root,'verification/local/registry-'+version+'.json');
mkdirSync(resolve(root,'verification/local'),{recursive:true});
try {
  writeFileSync(resolve(directory,'moon.mod'),'name = "local/registry_consumer"\nversion = "0.0.0"\nlicense = "Apache-2.0"\n');
  writeFileSync(resolve(directory,'moon.pkg'),'import { "HhWw96/moonmmdb" @mmdb }\n');
  copyFileSync(resolve(root,'examples/log_consumer/fixture.mbt'),resolve(directory,'fixture_wbtest.mbt'));
  writeFileSync(resolve(directory,'consumer.mbt'),'///|\npub fn installed_version() -> String { @mmdb.version() }\n');
  writeFileSync(resolve(directory,'consumer_wbtest.mbt'),`///|\ntest "registry version and exact ASN query" {\n  assert_eq(@mmdb.version(), "${version}")\n  let reader = @mmdb.open_bytes(asn_fixture())\n  let selected = reader.project("1.0.0.1", ["/autonomous_system_number"])\n  assert_true(selected.record_found)\n  assert_eq(selected.fields[0].1, Some(@mmdb.Unsigned32(15169)))\n}\n`);
  if(features.enrichment) {
    const path=resolve(directory,'consumer_wbtest.mbt');
    const query=`  let fields = @mmdb.prepare_fields(["/autonomous_system_number"])\n  let joined = @mmdb.Enricher::new([{ name: "asn", reader, fields }])\n  let result = joined.lookup("1.0.0.1")\n  assert_eq(result.status_code(), 0)\n  assert_eq(result.sources[0].0, "asn")\n`;
    writeFileSync(path,readFileSync(path,'utf8').replace(/}\n$/,query+'}\n'));
  }
  if(features.geo) {
    writeFileSync(resolve(directory,'moon.pkg'),'import { "HhWw96/moonmmdb" @mmdb, "HhWw96/moonmmdb/geo" @geo }\n');
    writeFileSync(resolve(directory,'consumer.mbt'),'///|\npub fn installed_version() -> String { @mmdb.version() }\n///|\npub fn lookup_asn(reader : @mmdb.Reader, ip : String) -> @geo.AsnLookup raise @geo.GeoError { @geo.lookup_asn(reader, ip) }\n');
    const file=resolve(directory,'consumer_wbtest.mbt');
    const extra=`  let cursor = reader.networks("1.0.0.1/32")\n  assert_eq(cursor.next().unwrap().network, "1.0.0.1/32")\n  assert_eq(cursor.next(), None)\n  cursor.close()\n  assert_eq(reader.validate(decode_data=true).unreachable_nodes, 0)\n  assert_eq(@geo.lookup_asn(reader,"1.0.0.1").record.unwrap().autonomous_system_number, Some(15169U))\n`;
    writeFileSync(file,readFileSync(file,'utf8').replace(/}\n$/,extra+'}\n'));
  }
  if(features.analytics) {
    const pkg=resolve(directory,'moon.pkg');
    writeFileSync(pkg,readFileSync(pkg,'utf8').replace(' @geo }',' @geo, "HhWw96/moonmmdb/analytics" @analytics }'));
    const consumer=resolve(directory,'consumer.mbt');
    writeFileSync(consumer,readFileSync(consumer,'utf8')+'///|\npub fn new_analysis(reader : @mmdb.Reader) -> @analytics.Analyzer raise @analytics.AnalyticsError { @analytics.Analyzer::new(reader, reader) }\n');
    const file=resolve(directory,'consumer_wbtest.mbt');
    const extra=`  let analysis = @analytics.Analyzer::new(reader, reader)\n  analysis.push("1.0.0.1")\n  analysis.invalid_input()\n  let report = analysis.finish()\n  assert_eq(report.requests, 2UL)\n  assert_eq(report.country.missing_field, 1UL)\n  assert_eq(report.asn.top[0].key, "15169")\n  assert_eq(report.exit_code, 2)\n  analysis.close()\n`;
    writeFileSync(file,readFileSync(file,'utf8').replace(/}\n$/,extra+'}\n'));
  }
  report.steps.push({name:'add',output:runMoon(['add','HhWw96/moonmmdb@'+version],directory,true)});
  if(existsSync(resolve(directory,'moon.work')))throw new Error('Unexpected workspace override');
  const packagePath=resolve(directory,'.mooncakes/HhWw96/moonmmdb/moon.mod');
  if(!existsSync(packagePath))throw new Error('Registry package missing from consumer dependency directory');
  report.downloaded_manifest_sha256=sha256(readFileSync(packagePath));
  for(const target of ['js','wasm-gc']){
    const log=runMoon(['test','--target',target,'--deny-warn'],directory,true);
    if(!log.includes('Total tests: 1, passed: 1, failed: 0.'))throw new Error('Registry consumer test did not execute');
    report.steps.push({target,output:log});
  }
  report.status='passed';
} catch(error){report.status='failed';report.error=error.message;process.exitCode=1;}
report.finished=new Date().toISOString();writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
