// Preview only the built public artifact; never expose arbitrary workspace files.
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../dist/web/index.html',import.meta.url));
createServer((req,res)=>{if(req.url!=='/'&&req.url!=='/index.html'){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}).end(html);}).listen(4173,'127.0.0.1',()=>console.log('Public artifact preview: http://127.0.0.1:4173/'));
