// Only publish artifacts from successful, code-matching validation runs.
import {execFileSync} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
const gh=args=>execFileSync('gh',args,{encoding:'utf8'});
const git=args=>execFileSync('git',args,{encoding:'utf8'}).trim();
const repo=process.env.GITHUB_REPOSITORY||'HhWw96/moonmmdb';
if(repo!=='HhWw96/moonmmdb')throw new Error('Unexpected publication repository');
for(const [key,name] of [['NATIVE_RUN','Native product validation'],['REGRESSION_RUN','Verify MoonMMDB']]){
 const id=process.env[key];if(!/^\d+$/.test(id||''))throw new Error('Expected numeric '+key);
 const run=JSON.parse(gh(['api',`repos/${repo}/actions/runs/${id}`]));
 if(run.name!==name||run.conclusion!=='success'||run.head_repository.full_name!==repo||run.head_branch!=='main')throw new Error('Run did not pass on main: '+id);
 git(['merge-base','--is-ancestor',run.head_sha,'HEAD']);
 const changed=git(['diff','--name-only',run.head_sha,'HEAD']).split('\n').filter(Boolean);
 if(changed.some(path=>!(/^(docs\/|verification\/releases\/)/.test(path)||['README.md','CHANGELOG.md'].includes(path))))throw new Error('Implementation changed after validation: '+changed.join(','));
}
if(process.argv.includes('--publish')){
 const receipt=JSON.parse(readFileSync('verification/releases/0.5.0/registry-0.5.0.json','utf8'));
 if(receipt.status!=='passed'||receipt.version!=='0.5.0'||receipt.module!=='HhWw96/moonmmdb')throw new Error('Missing fresh Mooncakes receipt');
 const manifest=readFileSync('moon.mod','utf8');if(!/^version = "0.5.0"$/m.test(manifest))throw new Error('Manifest version mismatch');
 const paths=['dist/publish/windows/moonmmdb-0.5.0-windows-x64.zip','dist/publish/linux/moonmmdb-0.5.0-linux-x64.tar.gz'];
 const checksum=[];
 for(const path of paths){
  const digest=createHash('sha256').update(readFileSync(path)).digest('hex');
  const folder=path.slice(0,path.lastIndexOf('/'));const file=path.slice(path.lastIndexOf('/')+1);
  if(!readFileSync(folder+'/SHA256SUMS','utf8').split(/\r?\n/).includes(digest+'  '+file))throw new Error('Artifact checksum mismatch');
  checksum.push(digest+'  '+file);
 }
 const url='https://download.mooncakes.io/user/HhWw96/moonmmdb/0.5.0.zip';
 const response=await fetch(url);if(!response.ok)throw new Error('Registry archive unavailable');
 const archive=Buffer.from(await response.arrayBuffer());
 const provenance=JSON.parse(readFileSync('verification/releases/0.5.0/publication.json','utf8'));
 if(createHash('sha256').update(archive).digest('hex')!==provenance.registry_archive_sha256)throw new Error('Registry archive differs from verified upload');
 const source='dist/publish/HhWw96-moonmmdb-0.5.0.zip';writeFileSync(source,archive);paths.push(source);
 checksum.push(provenance.registry_archive_sha256+'  HhWw96-moonmmdb-0.5.0.zip');
 writeFileSync('dist/publish/SHA256SUMS',checksum.join('\n')+'\n');paths.push('dist/publish/SHA256SUMS');
 if(!existsSync('docs/RELEASE_0_5.md'))throw new Error('Missing reviewed release notes');
 gh(['release','create','v0.5.0',...paths,'--repo',repo,'--target',git(['rev-parse','HEAD']),'--title','MoonMMDB v0.5.0 — Native command-line tools','--notes-file','docs/RELEASE_0_5.md']);
}
console.log('Verified release gates passed');
