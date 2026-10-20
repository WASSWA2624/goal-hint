import assert from "node:assert/strict";
import { randomUUID,createHash } from "node:crypto";
import test from "node:test";
import {createSubscribers,revenueBounds} from "../src/server/admin/subscribers.ts";
import {createMembersPurge} from "../src/server/members/purge.ts";
import {createAccessCodes} from "../src/server/members/access-codes.ts";
import {createAuthenticatedTestSessions as createMemberSessions} from "./helpers/member-fixtures.mjs";
import {createPayments} from "../src/server/members/payments.ts";
import {createPaymentReview} from "../src/server/admin/payment-review.ts";
import {takeMemberLimit} from "../src/server/members/rate-limit.ts";
import {paidDatabase} from "./helpers/paid-database.mjs";
import {jpeg} from "./helpers/payment-fixtures.mjs";
const DAY=86400000,HOUR=3600000;
test("subscriber management, accounting and retention on restricted MySQL",{timeout:180000},async t=>{
 const f=await paidDatabase();t.after(()=>f.close());const{database:db,config}=f;
 const base=Date.parse("2026-11-11T21:30:00Z");let clock=base,n=1000;const now=()=>clock;
 const codes=createAccessCodes({database:db,config,now}),sessions=createMemberSessions({database:db,config,now}),payments=createPayments({database:db,config,now,environment:null}),review=createPaymentReview(db,now),members=createSubscribers(db,now),purge=createMembersPurge(db,now);
 const planId=randomUUID();await db.query(tx=>tx.subscriptionSettings.create({data:{id:1,paywallMode:"test",mtnNumber:"256700000901",mtnName:"TEST",airtelNumber:"256700000902",airtelName:"TEST",paymentNumbersChangedAt:new Date(base),updatedAt:new Date(base),updatedBy:"owner"}}));await db.query(tx=>tx.subscriptionPlan.create({data:{id:planId,name:"Weekly",durationDays:7,priceUgx:5000,active:true,sortOrder:0,createdAt:new Date(base),updatedAt:new Date(base)}}));
 async function member(){const r=await sessions.signIn(`25670000${++n}`,"unknown");return sessions.verify(r.token);}
 async function manual(who,amount=3000){const r=await codes.manual({phone:who.phone,planId,amountReceivedUgx:amount,note:"Synthetic code"},"owner");assert.equal(r.status,"created");return r.ready;}
 async function report(who,tid=`TEST${++n}`){const r=await payments.submit(who,{planId,payerPhone:who.phone,network:"mtn",transactionId:tid,amount:5000,accepted:true},jpeg());assert.equal(r.status,"saved");return db.query(tx=>tx.paymentSubmission.findUniqueOrThrow({where:{reference:r.reference.slice(2)}}));}
 const fields=(id,amount=5000,network="mtn")=>({network,transactionRef:id,planId,amountReceivedUgx:amount});
 await t.test("EAT week/month revenue counts both submission sources and manual money, excluding trials/replacements/reversals",async()=>{
  const bounds=revenueBounds(base);assert.equal(bounds.week.toISOString(),"2026-11-08T21:00:00.000Z");assert.equal(bounds.month.toISOString(),"2026-10-31T21:00:00.000Z");
  const a=await member(),p=await report(a,"FORMREVENUE");await codes.approvePayment(p.id,fields("FORMREVENUE"),"owner");
  const b=await member();assert.equal((await codes.manual({phone:b.phone,planId,network:"airtel",transactionRef:"OWNERREVENUE",amountReceivedUgx:7000,note:"Synthetic owner wallet"},"owner")).status,"created");
  const c=await member(),r=await manual(c);const reissue=await codes.reissue(r.id,"owner");assert.equal(reissue.status,"created");const moved=await codes.changeNumber(c.accountId,{newPhone:`25670000${++n}`,verifiedBy:"payment-details"},"owner");assert.equal(moved.status,"created");
  const d=await member(),reversed=await report(d,"REVERSEREVENUE");await codes.approvePayment(reversed.id,fields("REVERSEREVENUE",6000),"owner");await codes.reversePayment(reversed.id,"network-reversal","owner");
  const trial=await member();await payments.trial(trial,"unknown");await codes.sendTrial(trial.accountId,2,"owner");
  clock=Date.parse("2026-11-05T21:30:00Z");await manual(await member(),2000);clock=base;
  await db.query(tx=>tx.ownerAuditEvent.create({data:{at:new Date(base),actor:"system",action:"uploads_busy",targetType:"payment",targetId:"ceiling",details:{}}}));
  const v=await members.overview();assert.equal(v.weekRevenue,15000);assert.equal(v.monthRevenue,17000);assert.equal(v.active,4);assert.equal(v.trials,1);assert.equal(v.busy,1);assert.equal(v.paymentNumbersChangedAt,new Date(base).toISOString());
 });
 await t.test("unlock counts, notes, blocking and erasure preserve accounting while removing personal data",async()=>{
  const who=await member(),ready=await manual(who);const accepted=await codes.redeem(who,ready.code,"unknown",2,"2026-10-19");assert.ok(await sessions.verify(accepted.token));await sessions.signIn(who.phone,"unknown");
  await db.query(tx=>tx.ownerAuditEvent.create({data:{at:new Date(base-31*DAY),actor:"member",action:"device_unlocked",accountId:who.accountId,targetType:"member-session",targetId:"old",details:{}}}));
  assert.equal((await members.detail(who.accountId)).unlocks,1);assert.equal((await members.detail(who.accountId)).devices.length,1);
  assert.equal((await members.action(who.accountId,"note","x".repeat(501),"owner")).status,"invalid");assert.equal((await members.action(who.accountId,"note","Synthetic private note","owner")).status,"saved");
  assert.equal((await members.action(who.accountId,"block",who.phone,"owner")).status,"invalid");
  assert.equal((await members.action(who.accountId,"block","Synthetic reason","owner")).status,"saved");assert.equal(await db.query(tx=>tx.memberSession.count({where:{accountId:who.accountId}})),0);assert.equal(await sessions.verify(accepted.token),null);assert.equal((await members.action(who.accountId,"unblock","Verified","owner")).status,"saved");
  const newSession=await sessions.signIn(who.phone,"unknown"),fresh=await sessions.verify(newSession.token);const p=await report(fresh,"ERASEMETADATA");await codes.approvePayment(p.id,fields("ERASEMETADATA"),"owner");
  assert.equal((await members.action(who.accountId,"erase",undefined,"owner")).status,"saved");const detail=await members.detail(who.accountId);assert.equal(detail.phone,null);assert.equal(detail.ownerNote,null);assert.ok(detail.erasedAt);assert.equal(detail.devices.length,0);assert.equal(await review.screenshot(p.id),null);
  const kept=await db.query(tx=>tx.paymentSubmission.findUniqueOrThrow({where:{id:p.id}}));assert.equal(kept.payerPhone,null);assert.equal(kept.rejectText,null);assert.equal(kept.amountReceivedUgx,5000);assert.equal(kept.transactionRef,"ERASEMETADATA");assert.equal(kept.planName,"Weekly");assert.equal(await db.query(tx=>tx.accessCode.count({where:{accountId:who.accountId,note:{not:null}}})),0);
  const audit=await members.audit();for(const action of ["member_note_changed","member_blocked","member_unblocked","member_erased"])assert.ok(audit.some(r=>r.action===action));assert.ok(!JSON.stringify(audit).includes(who.phone));assert.ok(!JSON.stringify(audit).includes(ready.code));assert.equal((await members.audit("member_erased")).length,1);
 });
 await t.test("number changes require verification, revoke every old period and return only a new-number code",async()=>{
  const who=await member();const first=await manual(who),second=await manual(who);const target=`25670000${++n}`;
  assert.equal((await codes.changeNumber(who.accountId,{newPhone:target},"owner")).status,"invalid");const moved=await codes.changeNumber(who.accountId,{newPhone:target,verifiedBy:"old-number"},"owner");assert.equal(moved.status,"created");assert.equal(moved.ready.phone,target);
  const audit=await db.query(tx=>tx.ownerAuditEvent.findMany({where:{action:"code_revoked",accountId:who.accountId}}));assert.equal(audit.length,2);assert.ok(audit.every(r=>r.details.verifiedBy==="old-number"));assert.equal(await db.query(tx=>tx.accessCode.count({where:{id:{in:[first.id,second.id]},revokedAt:{not:null}}})),2);
 });
 await t.test("each retention rule observes the injected clock; hourly claims serialize and pending images survive",async()=>{
  const keep=[],remove=[];
  for(const [status,days,expected] of [["approved",90,true],["approved",89,false],["reversed",91,true],["rejected",7,true],["rejected",6,false],["superseded",7,true],["pending",120,false]]){
   clock=base-days*DAY;const who=await member(),p=await report(who);if(["approved","reversed"].includes(status)){await codes.approvePayment(p.id,fields(p.claimedTxnRef),"owner");if(status==="reversed")await codes.reversePayment(p.id,"network-reversal","owner");}else if(status==="rejected")await review.reject(p.id,"unreadable","Synthetic",false,"owner");else if(status==="superseded")await db.query(tx=>tx.paymentSubmission.update({where:{id:p.id},data:{status,decidedAt:new Date(clock),decidedBy:"system:superseded"}}));(expected?remove:keep).push(p.id);
  }
  clock=base;const holder=await member();const expired=createHash("sha256").update("expired").digest("hex"),valid=createHash("sha256").update("valid").digest("hex");
  for(const [tokenHash,expiry] of [[expired,base-1],[valid,base+DAY]])await db.query(tx=>tx.memberSession.create({data:{tokenHash,accountId:holder.accountId,createdAt:new Date(base-DAY),lastSeenAt:new Date(base-DAY),expiresAt:new Date(expiry)}}));
  await db.query(tx=>tx.memberSession.createMany({data:Array.from({length:101},(_,i)=>({tokenHash:createHash("sha256").update(`batch-expired-${i}`).digest("hex"),accountId:holder.accountId,createdAt:new Date(base-DAY),lastSeenAt:new Date(base-DAY),expiresAt:new Date(base-1)}))}));
  const keys={};for(const [name,start,end] of [["expired",base-25*HOUR,base-24*HOUR],["locked",base-3*DAY,base+DAY],["new",base-HOUR,base],["legacy",base-2*DAY,null],["legacyNew",base-DAY,null]]){const key=createHash("sha256").update(name).digest("hex");keys[name]=key;await db.query(tx=>tx.rateLimitBucket.create({data:{key,windowStartedAt:new Date(start),lockedUntil:end===null?null:new Date(end)}}));}
  clock=base-31*DAY;const unused=await member(),withCode=await member();await manual(withCode,0);await db.query(tx=>tx.memberAccount.update({where:{id:unused.accountId},data:{passwordHash:null}}));clock=base;
  const outcomes=await Promise.all([purge.run(),createMembersPurge(db,now).run()]);assert.equal(outcomes.filter(r=>r.claimed).length,1);assert.equal(outcomes.reduce((sum,r)=>sum+r.images,0),4);assert.ok(outcomes.reduce((sum,r)=>sum+r.sessions,0)>=102);
  for(const id of remove){assert.equal(await review.screenshot(id),null);assert.ok((await db.query(tx=>tx.paymentSubmission.findUniqueOrThrow({where:{id}}))).imagePurgedAt);}for(const id of keep)assert.ok(await review.screenshot(id));
  assert.equal(await db.query(tx=>tx.memberSession.findUnique({where:{tokenHash:expired}})),null);assert.ok(await db.query(tx=>tx.memberSession.findUnique({where:{tokenHash:valid}})));
  for(const name of ["expired","legacy"])assert.equal(await db.query(tx=>tx.rateLimitBucket.findUnique({where:{key:keys[name]}})),null);for(const name of ["locked","new","legacyNew"])assert.ok(await db.query(tx=>tx.rateLimitBucket.findUnique({where:{key:keys[name]}})));
  assert.equal(await db.query(tx=>tx.memberAccount.findUnique({where:{id:unused.accountId}})),null);assert.ok(await db.query(tx=>tx.memberAccount.findUnique({where:{id:withCode.accountId}})));
  assert.equal((await purge.run()).claimed,false);clock+=HOUR;const again=await purge.run();assert.equal(again.claimed,true);assert.equal(again.images,0);assert.ok(await review.screenshot(keep.at(-1)));
  await db.query(tx=>tx.subscriptionSettings.update({where:{id:1},data:{screenshotRetentionDays:80}}));clock+=HOUR;assert.equal((await purge.run()).images,1);assert.ok(await review.screenshot(keep.at(-1)));
 });
 await t.test("window-end markers allow exact hourly and daily retention without retaining raw throttle values",async()=>{
  const address="198.51.100.51";await db.transaction(tx=>takeMemberLimit(tx,config,{purpose:"synthetic-hour",value:address,maximum:10,windowMs:HOUR},new Date(base)));
  const row=await db.query(tx=>tx.rateLimitBucket.findUniqueOrThrow({where:{key:config.key("member-synthetic-hour",address)}}));assert.equal(+row.lockedUntil,Math.floor(base/HOUR)*HOUR+HOUR);assert.ok(!JSON.stringify(row).includes(address));
 });
 await t.test("subscriber HTTP requires explicit verification and confirmation, keeps searches in bodies and opens new-number delivery",async()=>{
  const {createSubscriberHandlers}=await import("../src/server/admin/subscribers-http.ts");const who=await member();await manual(who);const handler=createSubscriberHandlers().POST;
  const context=(path,body)=>({services:{database:db,config:{...config,production:false}},owner:{username:"owner"},request:new Request(`http://synthetic.local/api/admin/subscribers${path}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)})});
  const searched=await handler(context("",{search:who.phone}));assert.equal(searched.status,200);assert.equal((await searched.json()).accounts[0].id,who.accountId);
  const newPhone=`25670000${++n}`;for(const invalid of [{action:"change-number",newPhone,confirmed:true},{action:"change-number",newPhone,verifiedBy:"old-number",confirmed:false},{action:"erase",confirmed:false}])assert.equal((await handler(context(`/${who.accountId}`,invalid))).status,400);
  const changed=await handler(context(`/${who.accountId}`,{action:"change-number",newPhone,verifiedBy:"payment-details",confirmed:true}));assert.equal(changed.status,201);const delivery=(await changed.json()).delivery;assert.equal(delivery.phone,newPhone);assert.ok(!delivery.message.includes(newPhone));assert.match(delivery.message,/#code=/);
 });

});
