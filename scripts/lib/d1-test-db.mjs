/**
 * An in-memory D1 stand-in on node:sqlite (Node 22+) whose batch() is one
 * transaction, the way D1's is: BEGIN, every statement, COMMIT, and on any
 * error ROLLBACK and rethrow. The stand-in in scripts/test-sealed.mjs runs a
 * batch statement by statement, so a failing statement there leaves the ones
 * before it written; tests of anything that relies on a batch being atomic
 * (a charge and what it buys) use this one.
 *
 *   const { db, DB, env, crash } = createTestDb();
 *   db     the node:sqlite DatabaseSync, for seeding and checking rows
 *   DB     the D1-shaped binding: exec, prepare(sql).bind(...).all/first/run, batch;
 *          DB.stats counts statements and batches and keeps the largest batch and bound value
 *   env    { DB, SITE_ORIGIN, ASSETS } where ASSETS serves /data/* from the repo
 *   crash  test hooks for an isolate that dies mid-request. `match` picks a batch
 *          by its first statement's SQL (a RegExp); `skip` lets that many matching
 *          batches by first. When one fires, the isolate is dead: every later call
 *          on DB throws until crash.revive(), so the request can't carry on and
 *          tidy up the way a live one would. Pass `{ dies: false }` for a passing
 *          error instead (a dropped connection), after which DB keeps working.
 *            crash.before(match, opts)     the batch throws before it runs (nothing written)
 *            crash.after(match, opts)      the batch commits, then throws (written, caller never hears)
 *            crash.inside(match, k, opts)  the batch throws after k statements (rolled back)
 *            crash.tamper(match, fn)       fn(db) runs just before the batch (another request got there first)
 *            crash.revive(), crash.clear(), crash.pending, crash.dead
 *
 * Options: `migrations: false` starts from an empty database, `upTo: "0020"`
 * applies the migrations up to and including that prefix only (a database from
 * before a migration), `yieldEach: true` (default) lets other requests run
 * between calls, so Promise.all races interleave the way two isolates would.
 */
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';

const root=new URL('../../',import.meta.url);

export function createTestDb({migrations=true,upTo=null,yieldEach=true}={}) {
  const db=new DatabaseSync(':memory:');
  if(migrations) {
    for(const file of readdirSync(new URL('worker/migrations/',root)).sort()) {
      if(upTo&&file.slice(0,upTo.length)>upTo) continue;
      db.exec(readFileSync(new URL('worker/migrations/'+file,root),'utf8'));
    }
  }
  const pause=()=>yieldEach?new Promise(resolve=>setImmediate(resolve)):null;
  const hooks=[];
  let dead=false;
  const crash={
    before(match,{skip=0,dies=true}={}){hooks.push({match,mode:'before',skip,dies});},
    after(match,{skip=0,dies=true}={}){hooks.push({match,mode:'after',skip,dies});},
    inside(match,k,{skip=0,dies=true}={}){hooks.push({match,mode:'in',k,skip,dies});},
    tamper(match,fn,{skip=0}={}){hooks.push({match,mode:'tamper',fn,skip,dies:false});},
    revive(){dead=false;},
    clear(){hooks.length=0;dead=false;},
    get pending(){return hooks.length;},
    get dead(){return dead;},
  };
  const takeHook=sql=>{
    for(const hook of hooks) {
      if(!hook.match.test(sql)) continue;
      if(hook.skip>0){hook.skip-=1;continue;}
      hooks.splice(hooks.indexOf(hook),1);
      return hook;
    }
    return null;
  };
  const alive=()=>{if(dead) throw new Error('test: this isolate is dead');};
  const die=(hook,message)=>{if(hook.dies) dead=true;throw new Error(message);};
  const stats={statements:0,batches:0,maxBatch:0,maxParams:0,maxParamBytes:0,rolledBack:0};
  const runSync=(sql,params)=>{
    const r=db.prepare(sql).run(...params);
    stats.statements+=1;
    return {success:true,meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)}};
  };
  const DB={
    stats,
    async exec(sql){await pause();alive();db.exec(sql);return {};},
    prepare(sql) {
      let params=[];
      const statement={
        sql,
        bind(...values){
          assert.ok(values.length<=100,'D1 allows at most 100 bound parameters');
          for(const v of values) assert.ok(v!==undefined,`undefined bound into: ${sql.slice(0,80)}`);
          stats.maxParams=Math.max(stats.maxParams,values.length);
          stats.maxParamBytes=Math.max(stats.maxParamBytes,...values.map(v=>typeof v==='string'?Buffer.byteLength(v):0));
          params=values;
          return statement;
        },
        async all(){await pause();alive();return {results:db.prepare(sql).all(...params)};},
        async first(column){await pause();alive();const r=db.prepare(sql).get(...params);return column?r?.[column]:r || null;},
        async run(){await pause();alive();return runSync(sql,params);},
        runSync(){return runSync(sql,params);},
      };
      return statement;
    },
    async batch(statements){
      await pause();
      alive();
      stats.batches+=1;
      stats.maxBatch=Math.max(stats.maxBatch,statements.length);
      const hook=takeHook(statements[0]?.sql||'');
      if(hook?.mode==='tamper') hook.fn(db);
      if(hook?.mode==='before') die(hook,'test: the isolate died before this batch');
      // Synchronous from BEGIN to COMMIT: no other request can run inside the transaction.
      const out=[];
      db.exec('BEGIN');
      try {
        statements.forEach((s,i)=>{
          if(hook?.mode==='in'&&i===hook.k) die(hook,'test: the isolate died inside this batch');
          out.push(s.runSync());
        });
        db.exec('COMMIT');
      } catch(err) {
        db.exec('ROLLBACK');stats.rolledBack+=1;
        throw err;
      }
      if(hook?.mode==='after') die(hook,'test: the isolate died after this batch');
      return out;
    },
  };
  const env={DB,SITE_ORIGIN:'https://poke-pack.rip',ASSETS:{fetch:async request=>{
    const path=new URL(request.url).pathname;
    if(!path.startsWith('/data/'))return new Response('',{status:404});
    try{return new Response(readFileSync(new URL('.'+path,root)),{headers:{'content-type':'application/json'}});}catch{return new Response('',{status:404});}
  }}};
  return {db,DB,env,crash};
}

/** A signed-in player with `coins`. Returns their session id. */
export function seedPlayer(db,{id='test',handle=id,coins=25,session=`${id}-session`}={}) {
  const now=Date.now();
  db.prepare('INSERT INTO users(id,name,handle,password_hash,color,created_at,last_played) VALUES(?,?,?,?,?,?,?)').run(id,id,handle,'unused','gold',now,now);
  db.prepare('INSERT INTO sessions(id,user_id,created_at,expires_at) VALUES(?,?,?,?)').run(session,id,now,now+3600000);
  db.prepare('INSERT INTO profiles(user_id,coins,granted,created_at,binder) VALUES(?,?,?,?,?)').run(id,coins,coins,now,'[]');
  return session;
}

/** `request(path, method, body, session)` against worker.fetch, resolving to { status, body }. */
export function requester(worker,env,defaultSession) {
  return async function request(path,method='GET',body,session=defaultSession) {
    const res=await worker.fetch(new Request('https://poke-pack.rip'+path,{method,headers:{'content-type':'application/json',origin:'https://poke-pack.rip',...(session?{cookie:'pp_sid='+session}:{})},...(body?{body:JSON.stringify(body)}:{})}),env);
    return {status:res.status,body:await res.json()};
  };
}
