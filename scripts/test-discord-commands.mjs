// The Discord slash commands (worker/discord-commands.js): signature checks, ping, /card with
// autocomplete, /profile, /notes and /play. Needs Node 22 or later (node:sqlite, Ed25519 WebCrypto).
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import worker from '../worker/index.js';
import {COMMANDS,matchNames} from '../worker/discord-commands.js';

const db=new DatabaseSync(':memory:');
for(const file of readdirSync(new URL('../worker/migrations/',import.meta.url)).sort()) db.exec(readFileSync(new URL('../worker/migrations/'+file,import.meta.url),'utf8'));
const DB={
  exec:async sql=>{db.exec(sql);return {};},
  prepare(sql){let params=[];const statement={
    bind(...values){params=values;return statement;},
    async all(){return {results:db.prepare(sql).all(...params)};},
    async first(column){const r=db.prepare(sql).get(...params);return column?r?.[column]:r||null;},
    async run(){const r=db.prepare(sql).run(...params);return {success:true,meta:{changes:Number(r.changes)}};},
  };return statement;},
  async batch(statements){const out=[];for(const s of statements)out.push(await s.run());return out;},
};
const now=Date.now();
db.prepare('INSERT INTO users(id,name,handle,password_hash,color,created_at,last_played,bio) VALUES(?,?,?,?,?,?,?,?)').run('u1','Ash Ketchum','ash','unused','gold',now,now,'Gotta rip them all');
db.prepare('INSERT INTO profiles(user_id,coins,granted,created_at,binder,packs_opened) VALUES(?,?,?,?,?,?)').run('u1',500,500,now,'[]',12);

const {publicKey,privateKey}=await crypto.subtle.generateKey('Ed25519',true,['sign','verify']);
const publicHex=Buffer.from(await crypto.subtle.exportKey('raw',publicKey)).toString('hex');
const env={DB,SITE_ORIGIN:'https://poke-pack.rip',DISCORD_PUBLIC_KEY:publicHex,ASSETS:{fetch:async request=>{
  const path=new URL(request.url).pathname;
  if(!path.startsWith('/data/'))return new Response('',{status:404});
  try{return new Response(readFileSync(new URL('..'+path,import.meta.url)),{headers:{'content-type':'application/json'}});}catch{return new Response('',{status:404});}
}}};
const sign=async(stamp,body)=>Buffer.from(await crypto.subtle.sign('Ed25519',privateKey,new TextEncoder().encode(stamp+body))).toString('hex');
async function interact(payload,{stamp=String(Math.floor(Date.now()/1000)),tamper=false,signature}={}){
  const body=JSON.stringify(payload);
  const sig=signature??await sign(stamp,tamper?body+' ':body);
  const res=await worker.fetch(new Request('https://poke-pack.rip/api/discord/interactions',{method:'POST',headers:{'content-type':'application/json','x-signature-ed25519':sig,'x-signature-timestamp':stamp},body}),env,{waitUntil(){}});
  return {status:res.status,body:res.status===200?await res.json():await res.text()};
}
const command=(name,options=[])=>({type:2,data:{name,options}});

// The signature check: no headers, a bad signature, a changed body and a stale timestamp are all refused.
assert.equal((await interact({type:1},{signature:'00'.repeat(64)})).status,401);
assert.equal((await interact({type:1},{tamper:true})).status,401);
assert.equal((await interact({type:1},{stamp:String(Math.floor(Date.now()/1000)-3600)})).status,401,'a replayed request is refused');
let res=await worker.fetch(new Request('https://poke-pack.rip/api/discord/interactions',{method:'POST',body:'{}'}),env,{waitUntil(){}});
assert.equal(res.status,401);
// Discord's ping, which is also what saves the endpoint URL in the developer portal.
assert.deepEqual((await interact({type:1})).body,{type:1});

// /card finds the card, prices it and lists other prints, rarest and priciest first.
res=await interact(command('card',[{name:'name',value:'Charizard ex'}]));
assert.equal(res.status,200);
assert.equal(res.body.type,4);
const embed=res.body.data.embeds[0];
assert.match(embed.title,/Charizard/i);
assert.match(embed.description,/\*\*\$[\d,]+\.\d\d\*\* market value/);
assert.ok(embed.image.url.startsWith('https://poke-pack.rip/assets/cards/'),embed.image.url);
assert.deepEqual(res.body.data.allowed_mentions,{parse:[]});
res=await interact(command('card',[{name:'name',value:'zzzznotacard'}]));
assert.equal(res.body.data.flags,64,'an unknown card is answered privately');
assert.match(res.body.data.content,/No card called/);

// Autocomplete: names that start with the typed text come first, at most 25.
res=await interact({type:4,data:{name:'card',options:[{name:'name',value:'chari',focused:true}]}});
assert.equal(res.body.type,8);
assert.ok(res.body.data.choices.length>0&&res.body.data.choices.length<=25);
assert.match(res.body.data.choices[0].name,/^Chari/);
assert.deepEqual((await interact({type:4,data:{name:'card',options:[{name:'name',value:'',focused:true}]}})).body.data.choices,[]);

// /profile reads the public profile.
res=await interact(command('profile',[{name:'trainer',value:'@Ash'}]));
assert.equal(res.body.data.embeds[0].title,'Ash Ketchum (@ash)');
assert.equal(res.body.data.embeds[0].url,'https://poke-pack.rip/u/ash');
assert.match(res.body.data.embeds[0].description,/Gotta rip them all/);
res=await interact(command('profile',[{name:'trainer',value:'nobodyhere'}]));
assert.equal(res.body.data.flags,64);
assert.match(res.body.data.content,/No trainer called @nobodyhere/);
assert.match((await interact(command('profile',[{name:'trainer',value:'a'}]))).body.data.content,/trainer handle/);

// /notes and /play, and a command we do not have.
res=await interact(command('notes'));
assert.ok(res.body.data.embeds[0].title.length>0);
assert.match((await interact(command('play'))).body.data.content,/poke-pack\.rip/);
assert.match((await interact(command('nope'))).body.data.content,/don't know/);

// The matcher, and the definitions Discord is given.
const index=JSON.parse(readFileSync(new URL('../data/search-index.json',import.meta.url),'utf8'));
assert.equal(index.names[matchNames(index,'Pikachu')[0]],'Pikachu','an exact name comes first');
assert.deepEqual(COMMANDS.map(c=>c.name),['card','profile','notes','play']);
assert.ok(COMMANDS.every(c=>/^[a-z-]{1,32}$/.test(c.name)&&c.description.length<=100));
console.log('discord commands: ok');
