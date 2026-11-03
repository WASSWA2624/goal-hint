import assert from 'node:assert/strict';
import test from 'node:test';
import { createMemberAuthFixture } from './helpers/member-auth-fixture.mjs';
import { createSlipNumberHandler } from '../src/server/slips/slip-numbers-http.ts';

test('number allocation checks origin, bounded inputs, entitlement, current session and expiry without retaining a snapshot',async()=>{
  const f=createMemberAuthFixture(),signed=await f.authenticate(),rows=new Map();
  let allowed=true,writes=0,checks=0;
  const rawQuery=f.tx.$queryRaw,rawWrite=f.tx.$executeRaw;
  f.tx.$queryRaw=async(parts,...values)=>parts.join('').includes('SlipNumber') ? rows.has(values[0]) ? [{number:rows.get(values[0])}] : [] : rawQuery(parts,...values);
  f.tx.$executeRaw=async(parts,...values)=>{
    if(parts.join('').includes('SlipNumber')){writes++;rows.set(values[0],rows.size+1);return 1;}
    return rawWrite(parts,...values);
  };
  const handle=createSlipNumberHandler({services:async()=>({database:f.database,config:f.config}),
    members:async()=>({config:{production:false},settings:{settings:null},sessions:{verify:async()=>signed.member}}),
    access:async()=>{checks++;return {tier:allowed?'full':'free'};},now:f.now});
  const request=(body,origin='https://goalhint.com')=>new Request('https://goalhint.com/api/slips/number',{
    method:'POST',headers:{origin,host:'goalhint.com','content-type':'application/json'},body:JSON.stringify(body)});
  const input={fingerprint:'a'.repeat(64)};
  assert.equal((await handle(request(input,'https://foreign.test'))).status,403);assert.equal(checks,0);
  for(const body of [{...input,slip:{selections:[]}},{fingerprint:'../bad'},{fingerprint:'a'.repeat(300)}])assert.equal((await handle(request(body))).status,400);
  allowed=false; assert.equal((await handle(request(input))).status,403);assert.equal(writes,0);
  allowed=true; const first=await handle(request(input));assert.equal(first.status,200);assert.equal((await first.json()).number,'00000001');
  assert.equal((await (await handle(request(input))).json()).number,'00000001');assert.equal(writes,1);
  f.advance(365*86400000);assert.equal((await handle(request({fingerprint:'b'.repeat(64)}))).status,403);assert.equal(writes,1);
});
