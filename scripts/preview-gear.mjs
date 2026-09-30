// Disposable preview of the sleeves and coins page: the real Worker on an in-memory
// SQLite stand-in for D1, the working tree served live, signed in as a test trainer
// with plenty of coins. Nothing persists. `node scripts/preview-gear.mjs [--seed]`
// serves http://127.0.0.1:5180; --seed also hands the trainer a few sleeves and coins.
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {createServer} from 'node:http';
import {extname} from 'node:path';
import worker from '../worker/index.js';

const db=new DatabaseSync(':memory:');
for(const file of readdirSync(new URL('../worker/migrations/',import.meta.url)).sort()) {
  db.exec(readFileSync(new URL('../worker/migrations/'+file,import.meta.url),'utf8'));
}
const DB={
  exec:async sql=>{db.exec(sql);return {};},
  prepare(sql) { let params=[];const statement={
    bind(...values){params=values;return statement;},
    async all(){return {results:db.prepare(sql).all(...params)};},
    async first(column){const r=db.prepare(sql).get(...params);return column?r?.[column]:r || null;},
    async run(){const r=db.prepare(sql).run(...params);return {success:true,meta:{changes:Number(r.changes)}};},
  };return statement;},
  async batch(statements){const out=[];for(const s of statements)out.push(await s.run());return out;},
};
const now=Date.now();
db.prepare('INSERT INTO users(id,name,handle,password_hash,color,created_at,last_played) VALUES(?,?,?,?,?,?,?)').run('test','Gear Tester','geartester','unused','gold',now,now);
db.prepare('INSERT INTO sessions(id,user_id,created_at,expires_at) VALUES(?,?,?,?)').run('local-test-session','test',now,now+86400000);
db.prepare('INSERT INTO profiles(user_id,coins,granted,created_at,binder) VALUES(?,?,?,?,?)').run('test',200000,200000,now,'[]');
const port=Number(process.env.PORT||5180);
const env={DB,SITE_ORIGIN:`http://127.0.0.1:${port}`,ASSETS:{fetch:async request=>{
  const path=new URL(request.url).pathname;
  try{return new Response(readFileSync(new URL('..'+path,import.meta.url)),{headers:{'content-type':path.endsWith('.json')?'application/json':'application/octet-stream'}});}catch{return new Response('',{status:404});}
}}};
if(process.argv.includes('--seed')||process.argv.includes('--all')) {
  const catalog=JSON.parse(readFileSync(new URL('../data/gear.json',import.meta.url),'utf8'));
  const all=process.argv.includes('--all');
  const ids=all?[...Object.keys(catalog.sleeves).filter((_,i)=>i%2===0).map(id=>['sleeve',id]),...Object.keys(catalog.coins).filter((_,i)=>i%2===0).map(id=>['coin',id])]:[...Object.keys(catalog.sleeves).slice(0,3).map(id=>['sleeve',id]),...Object.keys(catalog.coins).slice(0,5).map(id=>['coin',id])];
  for(const [kind,id] of ids) db.prepare('INSERT INTO user_gear(user_id,kind,item_id,qty,first_at,last_at) VALUES(?,?,?,?,?,?)').run('test',kind,id,1,now,now);
}
const mime={'.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.avif':'image/avif','.jpg':'image/jpeg','.woff2':'font/woff2'};
createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,env.SITE_ORIGIN);
    if(url.pathname.startsWith('/api/')) {
      const chunks=[];for await(const chunk of req)chunks.push(chunk);
      const result=await worker.fetch(new Request(url,{method:req.method,headers:{...req.headers,cookie:'pp_sid=local-test-session'},...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})}),env);
      res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));return;
    }
    const path=/^\/(?:js|css|data|assets)\//.test(url.pathname)?url.pathname:'/index.html';
    const content=readFileSync(new URL('..'+path,import.meta.url));
    res.writeHead(200,{'content-type':mime[extname(path)]||'application/octet-stream','cache-control':'no-store'});res.end(content);
  } catch(err){res.writeHead(404);res.end(String(err));}
}).listen(port,'127.0.0.1',()=>console.log(`Disposable gear preview: http://127.0.0.1:${port}/gear (memory only).`));
