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
import {silentPaymentNotifications} from "./helpers/payment-notification-fixtures.mjs";
import {readFile} from "node:fs/promises";
const DAY=86400000,HOUR=3600000;
test("subscriber management, accounting and retention on restricted MySQL",{timeout:180000},async t=>{
 const f=await paidDatabase();t.after(()=>f.close());const{database:db,config}=f;
 const base=Date.parse("2026-11-11T21:30:00Z");let clock=base,n=1000;const now=()=>clock;
 const codes=createAccessCodes({database:db,config,now,notifications:silentPaymentNotifications}),sessions=createMemberSessions({database:db,config,now}),payments=createPayments({database:db,config,now,environment:null}),review=createPaymentReview(db,now,{notifications:silentPaymentNotifications}),members=createSubscribers(db,now),purge=createMembersPurge(db,now);
 const planId=randomUUID();await db.query(tx=>tx.subscriptionSettings.create({data:{id:1,paywallMode:"test",mtnNumber:"256700000901",mtnName:"TEST",airtelNumber:"256700000902",airtelName:"TEST",paymentNumbersChangedAt:new Date(base),updatedAt:new Date(base),updatedBy:"owner"}}));await db.query(tx=>tx.subscriptionPlan.create({data:{id:planId,name:"Weekly",durationDays:7,priceUgx:5000,active:true,sortOrder:0,createdAt:new Date(base),updatedAt:new Date(base)}}));
 async function member(){const r=await sessions.signIn(`25670000${++n}`,"unknown");return sessions.verify(r.token);}
 async function manual(who,amount=3000){const r=await codes.manual({phone:who.phone,planId,amountReceivedUgx:amount,note:"Synthetic code"},"owner");assert.equal(r.status,"created");return r.ready;}
 async function report(who,tid=`TEST${++n}`){const r=await payments.submit(who,{planId,payerPhone:who.phone,network:"mtn",transactionId:tid,amount:5000,accepted:true},jpeg());assert.equal(r.status,"saved");return db.query(tx=>tx.paymentSubmission.findUniqueOrThrow({where:{reference:r.reference.slice(1)}}));}
 const fields=(id,amount=5000,network="mtn")=>({network,transactionRef:id,planId,amountReceivedUgx:amount});
 await t.test("EAT week/month revenue counts both submission sources and manual money, excluding trials/replacements/reversals",async()=>{
  const bounds=revenueBounds(base);assert.equal(bounds.week.toISOString(),"2026-11-08T21:00:00.000Z");assert.equal(bounds.month.toISOString(),"2026-10-31T21:00:00.000Z");
  const a=await member(),p=await report(a,"FORMREVENUE");await codes.approvePayment(p.id,fields("FORMREVENUE"),"owner");
  const b=await member();assert.equal((await codes.manual({phone:b.phone,planId,network:"airtel",transactionRef:"OWNERREVENUE",amountReceivedUgx:7000,note:"Synthetic owner wallet"},"owner")).status,"created");
  const c=await member(),r=await manual(c);const reissue=await codes.reissue(r.id,"owner");assert.equal(reissue.status,"created");const moved=await codes.changeNumber(c.accountId,{newPhone:`25670000${++n}`,verifiedBy:"payment-details"},"owner");assert.equal(moved.status,"created");
  const d=await member(),reversed=await report(d,"REVERSEREVENUE");await codes.approvePayment(reversed.id,fields("REVERSEREVENUE",6000),"owner");await codes.reversePayment(reversed.id,"network-reversal","owner");
  // A historical automatic-trial period is accounting data, never an owner queue action.
  const trial=await member(),trialAt=new Date(clock);
  await db.query(tx=>tx.accessCode.create({data:{id:randomUUID(),accountId:trial.accountId,codeSalt:new Uint8Array(16),
   codeHash:createHash("sha256").update("synthetic-free-trial").digest("hex"),reference:"TRAL",source:"trial",planName:"Free trial",durationDays:2,
   priceUgx:0,amountReceivedUgx:0,createdAt:trialAt,createdBy:"system:registration",activatedAt:trialAt,startsAt:trialAt,endsAt:new Date(clock+2*DAY)}}));
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
 await t.test("the purge keeps open SMS notices, removes closed ones after 7 or 30 days, and erasure removes an account's notices",async()=>{
  clock=Math.max(clock,base)+2*HOUR;const at=clock,who=await member();
  const notice=(status,days)=>({id:randomUUID(),accountId:who.accountId,targetType:"payment",decision:"approved",targetId:randomUUID(),status,
   createdAt:new Date(at-40*DAY),startedAt:["sent","failed","uncertain"].includes(status)?new Date(at-40*DAY):null,
   attemptId:["sent","failed","uncertain"].includes(status)?randomUUID():null,finishedAt:days===null?null:new Date(at-days*DAY)});
  const removed=[notice("sent",7),notice("unsupported",8),notice("failed",30)],kept=[notice("sent",6.5),notice("uncertain",29),notice("failed",29),notice("queued",null)];
  await db.query(tx=>tx.paymentNotificationOutbox.createMany({data:[...removed,...kept]}));
  const result=await purge.run();assert.equal(result.claimed,true);assert.equal(result.notices,removed.length);
  const left=(await db.query(tx=>tx.paymentNotificationOutbox.findMany({where:{accountId:who.accountId},select:{id:true}}))).map(row=>row.id).sort();
  assert.deepEqual(left,kept.map(row=>row.id).sort());
  const audit=await db.query(tx=>tx.ownerAuditEvent.findFirst({where:{action:"members_purged"},orderBy:{id:"desc"}}));assert.equal(audit.details.notices,removed.length);
  assert.equal((await members.action(who.accountId,"erase",undefined,"owner")).status,"saved");
  assert.equal(await db.query(tx=>tx.paymentNotificationOutbox.count({where:{accountId:who.accountId}})),0);
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

 await t.test("overview preview shows only the two oldest pending payments and excludes private payment details",async()=>{
  const existing=await db.query(tx=>tx.paymentSubmission.findMany({where:{status:"pending"},select:{id:true}}));
  if(existing.length)await db.query(tx=>tx.paymentSubmission.updateMany({where:{id:{in:existing.map(row=>row.id)}},data:{status:"rejected"}}));
  const submitted=[];
  for(let i=0;i<3;i++){clock=base+(i+1)*HOUR;submitted.push(await report(await member(),`PREVIEW${i}`));}
  const rows=await members.pendingPayments();
  assert.deepEqual(rows.map(row=>row.id),submitted.slice(0,2).map(row=>row.id));
  assert.equal(rows[0].amount,5000);assert.equal(rows[0].reference,`P${submitted[0].reference}`);
  assert.deepEqual(Object.keys(rows[0]).sort(),["amount","id","network","reference","submittedAt"]);
  await db.query(tx=>tx.paymentSubmission.update({where:{id:submitted[0].id},data:{status:"rejected"}}));
  assert.deepEqual((await members.pendingPayments()).map(row=>row.id),submitted.slice(1).map(row=>row.id));
  clock=base;
 });
});

test("permanent subscriber deletion on restricted MySQL", {timeout:180000}, async t => {
 const f=await paidDatabase();t.after(()=>f.close());const{database:db,config,root}=f;
 const at=new Date("2026-10-23T10:00:00Z"),now=()=>+at,hash=value=>createHash("sha256").update(value).digest("hex");
 const members=createSubscribers(db,now,()=>false,config),planId=randomUUID();let reference=0;
 await db.query(tx=>tx.subscriptionPlan.create({data:{id:planId,name:"Shared weekly plan",durationDays:7,priceUgx:5000,active:true,sortOrder:0,createdAt:at,updatedAt:at}}));
 await db.query(tx=>tx.subscriptionSettings.create({data:{id:1,paywallMode:"test",updatedAt:at,updatedBy:"owner"}}));
 // The paid-access harness has no football catalog. This minimal shared fixture installs the real saved-slip child
 // table and its cascade, so deletion must remove private selections while preserving the referenced fixture.
 await root.query("CREATE TABLE FootballFixture (id CHAR(36) NOT NULL PRIMARY KEY) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin");
 const fixtureId=randomUUID();await root.query("INSERT INTO FootballFixture (id) VALUES (?)",[fixtureId]);
 await root.query((await readFile(new URL("../prisma/migrations/20261021110000_saved_slips/migration.sql",import.meta.url),"utf8")).split(";")[1]);
 async function account(phone,extra={}) {return db.query(tx=>tx.memberAccount.create({data:{id:randomUUID(),phone,passwordHash:"synthetic-password-hash",phoneVerifiedAt:at,passwordChangedAt:at,temporaryPasswordHash:"synthetic-temporary-hash",temporaryPasswordExpiresAt:new Date(+at+HOUR),ownerNote:"Synthetic private note",createdAt:at,lastSignInAt:at,...extra}}));}
 async function payment(who,extra={}) {const id=randomUUID();return db.query(tx=>tx.paymentSubmission.create({data:{id,reference:String(++reference).padStart(4,"0"),source:"report",accountId:who.id,planId,planName:"Shared weekly plan",durationDays:7,priceUgx:5000,payerPhone:who.phone,claimedNetwork:"mtn",claimedTxnRef:`SYNTHETIC${reference}`,claimedTxnKey:`SYNTHETIC${reference}`,claimedAmountUgx:5000,status:"pending",submittedAt:at,rejectText:"Synthetic private payment text",...extra}}));}
 async function code(who,extra={}) {return db.query(tx=>tx.accessCode.create({data:{id:randomUUID(),accountId:who.id,codeSalt:new Uint8Array(16).fill(reference+1),codeHash:hash(randomUUID()),reference:String(++reference).padStart(4,"0"),source:"manual",planId,planName:"Shared weekly plan",durationDays:7,priceUgx:5000,amountReceivedUgx:5000,createdAt:at,createdBy:"owner",activatedAt:at,startsAt:at,endsAt:new Date(+at+7*DAY),note:"Synthetic private code note",...extra}}));}
 async function verification(who,phone=who.phone) {return db.query(tx=>tx.memberVerification.create({data:{id:randomUUID(),accountId:who.id,phone,purpose:"register",channel:"sms",bindingHash:hash(randomUUID()),codeHash:hash(randomUUID()),createdAt:at,expiresAt:new Date(+at+HOUR)}}));}
 async function slip(who) {const row=await db.query(tx=>tx.savedSlip.create({data:{id:randomUUID(),accountId:who.id,fingerprint:hash(randomUUID()),snapshotJson:{private:"Synthetic saved selection"},createdAt:at}}));await root.query("INSERT INTO SavedSlipFixture (slipId,fixtureId) VALUES (?,?)",[row.id,fixtureId]);return row;}
 async function audit(data) {return db.query(tx=>tx.ownerAuditEvent.create({data:{at,actor:"owner",action:"access_granted",targetType:"member",targetId:"unrelated",details:{},...data}}));}
 async function snapshot() {return db.query(async tx=>{
  const tables={memberAccount:"id",memberSession:"tokenHash",memberVerification:"id",paymentSubmission:"id",paymentScreenshot:"submissionId",accessCode:"id",savedSlip:"id",ownerAuditEvent:"id",rateLimitBucket:"key",subscriptionPlan:"id",subscriptionSettings:"id"};
  return Object.fromEntries(await Promise.all(Object.entries(tables).map(async([table,key])=>[table,await tx[table].findMany({orderBy:{[key]:"asc"}})])));
 });}
 await t.test("removes every owned record and historical identity while preserving other accounts and shared data",async()=>{
  const who=await account("256700004001"),other=await account("256700004002"),oldPhone="256700004003";
  const token="d".repeat(43),tokenHash=hash(token),historicalHash=hash("historical subscriber device");
  const ownPayment=await payment(who,{submittedSessionHash:historicalHash}),pendingPayment=await payment(who);
  const screenshot=jpeg();for(const p of [ownPayment,pendingPayment])await db.query(tx=>tx.paymentScreenshot.create({data:{submissionId:p.id,width:1,height:1,bytes:screenshot.length,data:screenshot}}));
  const ownCode=await code(who),ownCycle=await code(who,{replacedById:ownCode.id});
  await db.query(tx=>tx.accessCode.update({where:{id:ownCode.id},data:{replacedById:ownCycle.id}}));
  const foreignCode=await code(other,{source:"payment",paymentSubmissionId:ownPayment.id,replacedById:ownCode.id});
  const otherCode=await code(other),otherPayment=await payment(other,{payerPhone:oldPhone,submittedSessionHash:tokenHash});
  await db.query(tx=>tx.paymentScreenshot.create({data:{submissionId:otherPayment.id,width:1,height:1,bytes:screenshot.length,data:screenshot}}));
  await db.query(tx=>tx.memberSession.create({data:{tokenHash,accountId:who.id,createdAt:at,lastSeenAt:at,expiresAt:new Date(+at+DAY),authenticatedAt:at,codeEnteredAt:at,accessCodeId:ownCode.id}}));
  const otherSession=await db.query(tx=>tx.memberSession.create({data:{tokenHash:hash("other subscriber device"),accountId:other.id,createdAt:at,lastSeenAt:at,expiresAt:new Date(+at+DAY),authenticatedAt:at,codeEnteredAt:at,accessCodeId:otherCode.id}}));
  await verification(who);await verification(who,oldPhone);const unbound=await verification({id:null,phone:oldPhone});
  const otherVerification=await verification(other),ownSlip=await slip(who),otherSlip=await slip(other);
  const ownedAudit=await audit({accountId:who.id,targetId:who.id}),targetAudit=await audit({targetType:"payment",targetId:ownPayment.id}),actorAudit=await audit({actor:`member-admin:${who.id}`});
  await audit({actor:who.id});
  const sharedAudit=await audit({accountId:other.id,targetId:other.id,details:{previousAccountId:who.id,codeId:ownCode.id,liveCodeId:ownCycle.id,paymentReference:`P${ownPayment.reference}`,legacyPaymentReference:`P-${ownPayment.reference}`,unrelated:"retained"}});
  const cleanAudit=await audit({accountId:other.id,targetId:other.id,details:{note:"Retained unrelated event"}});
  const ownKeys=[config.key("member-current-password-account",who.id),config.key("member-save-slip",who.id),...([who.phone,oldPhone].flatMap(phone=>[config.key("member-password-login-phone",phone),config.key("member-register-phone",phone)])),...([tokenHash,historicalHash].flatMap(session=>[config.key("member-upload-attempts",session),config.key("member-upload-stored",session),config.key("member-trial-session",session)]))];
  const sharedKey=config.key("member-sign-ins","198.51.100.100"),otherKey=config.key("member-save-slip",other.id);
  await db.query(tx=>tx.rateLimitBucket.createMany({data:[...ownKeys,sharedKey,otherKey].map(key=>({key,windowStartedAt:at}))}));
  const savedPlan=await db.query(tx=>tx.subscriptionPlan.findUnique({where:{id:planId}})),savedSettings=await db.query(tx=>tx.subscriptionSettings.findUnique({where:{id:1}}));
  assert.deepEqual(await members.action(who.id,"delete",undefined,"owner"),{status:"saved"});
  for(const table of ["memberSession","memberVerification","paymentSubmission","accessCode","savedSlip"])assert.equal(await db.query(tx=>tx[table].count({where:{accountId:who.id}})),0,table);
  assert.equal(await db.query(tx=>tx.memberAccount.findUnique({where:{id:who.id}})),null);
  assert.equal(await members.detail(who.id),null);assert.deepEqual(await members.search(who.phone),[]);
  assert.equal(await db.query(tx=>tx.paymentScreenshot.count({where:{submissionId:{in:[ownPayment.id,pendingPayment.id]}}})),0);
  assert.equal(await db.query(tx=>tx.memberVerification.findUnique({where:{id:unbound.id}})),null);
  assert.equal(await db.query(tx=>tx.memberVerification.count({where:{phone:{in:[who.phone,oldPhone]}}})),0);
  assert.equal(await db.query(tx=>tx.ownerAuditEvent.count({where:{id:{in:[ownedAudit.id,targetAudit.id,actorAudit.id]}}})),0);
  const remainingAudit=await db.query(tx=>tx.ownerAuditEvent.findMany());
  for(const privateValue of [who.id,ownCode.id,ownCycle.id,ownPayment.id,`P${ownPayment.reference}`,`P-${ownPayment.reference}`,tokenHash])assert.ok(!JSON.stringify(remainingAudit,(_key,value)=>typeof value==="bigint"?String(value):value).includes(privateValue),`audit removed ${privateValue}`);
  assert.equal((await db.query(tx=>tx.ownerAuditEvent.findUnique({where:{id:sharedAudit.id}}))).details.unrelated,"retained");
  assert.deepEqual(await db.query(tx=>tx.ownerAuditEvent.findUnique({where:{id:cleanAudit.id}})),cleanAudit);
  const retained=await db.query(tx=>tx.accessCode.findUniqueOrThrow({where:{id:foreignCode.id}}));
  assert.equal(retained.accountId,other.id);assert.equal(retained.replacedById,null);assert.equal(retained.paymentSubmissionId,null);assert.notEqual(retained.source,"payment");assert.equal(+retained.endsAt,+foreignCode.endsAt);
  const retainedPayment=await db.query(tx=>tx.paymentSubmission.findUniqueOrThrow({where:{id:otherPayment.id}}));
  assert.equal(retainedPayment.payerPhone,null);assert.equal(retainedPayment.submittedSessionHash,null);assert.equal(retainedPayment.claimedAmountUgx,otherPayment.claimedAmountUgx);assert.ok(await db.query(tx=>tx.paymentScreenshot.findUnique({where:{submissionId:otherPayment.id}})));
  assert.deepEqual(await db.query(tx=>tx.memberAccount.findUnique({where:{id:other.id}})),other);assert.deepEqual(await db.query(tx=>tx.memberSession.findUnique({where:{tokenHash:otherSession.tokenHash}})),otherSession);assert.deepEqual(await db.query(tx=>tx.memberVerification.findUnique({where:{id:otherVerification.id}})),otherVerification);assert.deepEqual(await db.query(tx=>tx.accessCode.findUnique({where:{id:otherCode.id}})),otherCode);
  assert.ok(await db.query(tx=>tx.savedSlip.findUnique({where:{id:otherSlip.id}})));assert.equal(Number((await root.query("SELECT COUNT(*) AS total FROM SavedSlipFixture WHERE slipId=?",[ownSlip.id]))[0].total),0);assert.equal(Number((await root.query("SELECT COUNT(*) AS total FROM SavedSlipFixture WHERE slipId=?",[otherSlip.id]))[0].total),1);assert.equal(Number((await root.query("SELECT COUNT(*) AS total FROM FootballFixture WHERE id=?",[fixtureId]))[0].total),1);
  assert.equal(await db.query(tx=>tx.rateLimitBucket.count({where:{key:{in:ownKeys}}})),0);assert.equal(await db.query(tx=>tx.rateLimitBucket.count({where:{key:{in:[sharedKey,otherKey]}}})),2);
  assert.deepEqual(await db.query(tx=>tx.subscriptionPlan.findUnique({where:{id:planId}})),savedPlan);assert.deepEqual(await db.query(tx=>tx.subscriptionSettings.findUnique({where:{id:1}})),savedSettings);
 });
 await t.test("a reassigned historical phone retains its new owner's payment, challenges and phone throttles",async()=>{
  const who=await account("256700004008"),newOwner=await account("256700004009");
  const historical=await verification(who,newOwner.phone),ownedPayment=await payment(who,{payerPhone:newOwner.phone});
  const newOwnerVerification=await verification(newOwner),unbound=await verification({id:null,phone:newOwner.phone}),newOwnerPayment=await payment(newOwner);
  const phoneKeys=["password-login-phone","register-phone"].map(purpose=>config.key(`member-${purpose}`,newOwner.phone));
  await db.query(tx=>tx.rateLimitBucket.createMany({data:phoneKeys.map(key=>({key,count:3,windowStartedAt:at,lockedUntil:new Date(+at+HOUR)}))}));
  const buckets=await db.query(tx=>tx.rateLimitBucket.findMany({where:{key:{in:phoneKeys}},orderBy:{key:"asc"}}));
  assert.equal((await members.action(who.id,"delete",undefined,"owner")).status,"saved");
  assert.equal(await db.query(tx=>tx.memberAccount.findUnique({where:{id:who.id}})),null);
  assert.equal(await db.query(tx=>tx.memberVerification.findUnique({where:{id:historical.id}})),null);
  assert.equal(await db.query(tx=>tx.paymentSubmission.findUnique({where:{id:ownedPayment.id}})),null);
  assert.deepEqual(await db.query(tx=>tx.memberAccount.findUnique({where:{id:newOwner.id}})),newOwner);
  assert.deepEqual(await db.query(tx=>tx.paymentSubmission.findUnique({where:{id:newOwnerPayment.id}})),newOwnerPayment);
  assert.deepEqual(await db.query(tx=>tx.memberVerification.findUnique({where:{id:newOwnerVerification.id}})),newOwnerVerification);
  assert.deepEqual(await db.query(tx=>tx.memberVerification.findUnique({where:{id:unbound.id}})),unbound);
  assert.deepEqual(await db.query(tx=>tx.rateLimitBucket.findMany({where:{key:{in:phoneKeys}},orderBy:{key:"asc"}})),buckets);
 });
 await t.test("previously erased accounts and administrator accounts can be permanently removed",async()=>{
  const erased=await account(null,{erasedAt:at,passwordHash:null,phoneVerifiedAt:null}),erasedPayment=await payment(erased),erasedCode=await code(erased);
  await audit({accountId:erased.id,targetId:erased.id,action:"member_erased"});
  assert.equal((await members.action(erased.id,"delete",undefined,"owner")).status,"saved");
  assert.equal(await db.query(tx=>tx.memberAccount.findUnique({where:{id:erased.id}})),null);assert.equal(await db.query(tx=>tx.paymentSubmission.findUnique({where:{id:erasedPayment.id}})),null);assert.equal(await db.query(tx=>tx.accessCode.findUnique({where:{id:erasedCode.id}})),null);
  const administrator=await account("256700004005");assert.equal((await createSubscribers(db,now,()=>true,config).action(administrator.id,"delete",undefined,"owner")).status,"saved");assert.equal(await db.query(tx=>tx.memberAccount.findUnique({where:{id:administrator.id}})),null);
 });
 await t.test("a missing account is refused without leaving records",async()=>{
  const before=await snapshot();assert.equal((await members.action(randomUUID(),"delete",undefined,"owner")).status,"refused");assert.deepEqual(await snapshot(),before);
 });
 await t.test("a failure at the final account delete rolls back every earlier removal and cross-account edit",async()=>{
  const who=await account("256700004006"),other=await account("256700004007"),p=await payment(who),c=await code(who),otherCode=await code(other,{replacedById:c.id});
  await verification(who);await slip(who);await audit({accountId:who.id,targetId:p.id});
  const screenshot=jpeg();await db.query(tx=>tx.paymentScreenshot.create({data:{submissionId:p.id,width:1,height:1,bytes:screenshot.length,data:screenshot}}));
  const before=await snapshot(),linksBefore=await root.query("SELECT * FROM SavedSlipFixture ORDER BY slipId,fixtureId");
  await root.query(`CREATE TRIGGER RejectSyntheticMemberDeletion BEFORE DELETE ON MemberAccount FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Synthetic deletion failure'`);
  try {await assert.rejects(members.action(who.id,"delete",undefined,"owner"));assert.deepEqual(await snapshot(),before);assert.deepEqual(await root.query("SELECT * FROM SavedSlipFixture ORDER BY slipId,fixtureId"),linksBefore);}
  finally {await root.query("DROP TRIGGER RejectSyntheticMemberDeletion");}
  assert.equal((await members.action(who.id,"delete",undefined,"owner")).status,"saved");assert.equal((await db.query(tx=>tx.accessCode.findUnique({where:{id:otherCode.id}}))).replacedById,null);
 });
});
