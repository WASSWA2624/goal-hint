import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createAccessCodes } from "../src/server/members/access-codes.ts";
import { createAuthenticatedTestSessions as createMemberSessions } from "./helpers/member-fixtures.mjs";
import { createPayments } from "../src/server/members/payments.ts";
import { createPaymentReview } from "../src/server/admin/payment-review.ts";
import { paidDatabase } from "./helpers/paid-database.mjs";
import { jpeg } from "./helpers/payment-fixtures.mjs";
import { MysqlServerUnavailableError } from "./helpers/mysql-instance.mjs";
import { silentPaymentNotifications } from "./helpers/payment-notification-fixtures.mjs";

test("owner review transactions on restricted real MySQL",{timeout:180000},async t=>{
  let f; try { f=await paidDatabase(); } catch (error) { if (!(error instanceof MysqlServerUnavailableError)) throw error; t.skip(error.message); return; }
  t.after(()=>f.close()); const {database:db,config}=f;
  let clock=Date.parse("2026-10-19T09:00:00Z"), n=500;
  const notifications = { approvals: [], rejections: [], async approved(payment) { assert.equal((await db.query(tx=>tx.paymentSubmission.findUniqueOrThrow({where:{id:payment.paymentId}}))).status,"approved"); this.approvals.push(payment); return "sent"; }, async rejected(payment) { assert.equal((await db.query(tx=>tx.paymentSubmission.findUniqueOrThrow({where:{id:payment.paymentId}}))).status,"rejected"); this.rejections.push(payment); return "sent"; } };
  const now=()=>clock, codes=createAccessCodes({database:db,config,now,notifications}), sessions=createMemberSessions({database:db,config,now}), payments=createPayments({database:db,config,now,environment:null}), review=createPaymentReview(db,now,{notifications});
  const planId=randomUUID(); await db.query(tx=>tx.subscriptionSettings.create({data:{id:1,paywallMode:"test",mtnNumber:"256700000901",mtnName:"TEST",airtelNumber:"256700000902",airtelName:"TEST AIRTEL",updatedAt:new Date(clock),updatedBy:"owner"}}));
  await db.query(tx=>tx.subscriptionPlan.create({data:{id:planId,name:"Weekly",durationDays:7,priceUgx:5000,active:true,sortOrder:0,createdAt:new Date(clock),updatedAt:new Date(clock)}}));
  async function member(){ const signed=await sessions.signIn(`25670000${String(++n).padStart(4,"0")}`,"unknown"); return sessions.verify(signed.token); }
  async function report(who,tid,other={}){ const r=await payments.submit(who,{planId,payerPhone:who.phone,network:"mtn",transactionId:tid,amount:5000,accepted:true,...other},jpeg()); assert.equal(r.status,"saved"); return db.query(tx=>tx.paymentSubmission.findUniqueOrThrow({where:{reference:r.reference.slice(1)}})); }
  const fields=(tid,other={})=>({planId,network:"mtn",transactionRef:tid,amountReceivedUgx:5000,...other});
  await t.test("two reports, punctuation variants and a manual code race all serialize to one approval",async()=>{
    for(const pair of [["RACEA","RACEA"],["RACE.B","RACEB"]]){const a=await report(await member(),pair[0]),b=await report(await member(),pair[1]);const r=await Promise.all([codes.approvePayment(a.id,fields(pair[0]),"owner"),codes.approvePayment(b.id,fields(pair[1]),"owner")]);assert.deepEqual(r.map(x=>x.status).sort(),["created","duplicate"]);}
    const a=await report(await member(),"RACEMANUAL"),m=await member(); const r=await Promise.all([codes.approvePayment(a.id,fields("RACEMANUAL"),"owner"),codes.manual({phone:m.phone,planId,network:"airtel",transactionRef:"RACE.MANUAL",amountReceivedUgx:5000,note:"Synthetic race"},"owner")]);assert.deepEqual(r.map(x=>x.status).sort(),["created","duplicate"]);
  });
  await t.test("edited values persist; renewal carries entitlement with no further code entry",async()=>{
    const who=await member(), row=await report(who,"EDITOLD"); const first=await codes.approvePayment(row.id,fields("EDIT-NEW",{network:"airtel",amountReceivedUgx:6000}),"owner");assert.equal(first.status,"created");assert.equal(+first.grant.startsAt,clock);assert.equal(first.grant.devicesUnlocked,1);
    const stored=await db.query(tx=>tx.paymentSubmission.findUniqueOrThrow({where:{id:row.id}}));assert.equal(stored.transactionRef,"EDITNEW");assert.equal(stored.network,"airtel");assert.equal(stored.amountReceivedUgx,6000);
    const unlocked={...who,codeEnteredAt:new Date(clock)};const next=await report(unlocked,"EDITRENEW");const renewed=await codes.approvePayment(next.id,fields("EDITRENEW"),"owner");assert.equal(+renewed.grant.startsAt,+first.grant.endsAt);assert.equal(renewed.notification,"sent");assert.equal(+notifications.approvals.at(-1).expiresAt,+renewed.grant.endsAt);assert.equal(notifications.approvals.at(-1).phone,who.phone);clock=+first.grant.endsAt+1;
    const view=await codes.accountView(unlocked);assert.ok(view.codes.some(c=>+c.startsAt<=clock&&+c.endsAt>clock));assert.ok(!("ready" in renewed));
    const list=await review.codes();assert.equal(list.find(c=>c.id===first.grant.id).planName,"Weekly");assert.ok(!JSON.stringify(list).includes("codeHash"));
    const sends=notifications.approvals.length;assert.equal((await codes.approvePayment(row.id,fields("EDIT-NEW"),"owner")).status,"duplicate");assert.equal(notifications.approvals.length,sends);
  });
  await t.test("trial send and dismiss serialize once, use zero revenue and retain only hashed IP evidence",async()=>{
    const who=await member();assert.equal(await payments.trial(who,"198.51.100.41"),"saved");const queue=await review.list();assert.equal(queue.trials.find(t=>t.id===who.accountId).ipCount,1);
    const pendingSession=await db.query(tx=>tx.memberSession.findUniqueOrThrow({where:{tokenHash:who.tokenHash}}));assert.equal(pendingSession.codeEnteredAt,null);
    const r=await Promise.all([codes.sendTrial(who.accountId,2,"owner"),codes.sendTrial(who.accountId,2,"owner")]);assert.deepEqual(r.map(x=>x.status).sort(),["created","refused"]);const ready=r.find(x=>x.status==="created").grant;assert.equal(+ready.endsAt-+ready.startsAt,2*86400000);assert.equal(ready.devicesUnlocked,1);
    assert.equal((await codes.dismissTrial(who.accountId,"owner")).status,"refused");const row=await db.query(tx=>tx.accessCode.findUniqueOrThrow({where:{id:ready.id}}));assert.equal(row.amountReceivedUgx,0);assert.equal(row.source,"trial");
    const other=await member();await payments.trial(other,"unknown");assert.equal((await codes.dismissTrial(other.accountId,"owner")).status,"saved");assert.equal((await codes.sendTrial(other.accountId,2,"owner")).status,"refused");
    const audits=await db.query(tx=>tx.ownerAuditEvent.findMany());for(const a of audits)assert.ok(!JSON.stringify(a.details).includes("198.51.100.41"));for(const a of ["trial_sent","trial_dismissed"])assert.ok(audits.some(e=>e.action===a));
  });
  await t.test("stolen-ID recovery keeps the ID unapprovable and records the real money once",async()=>{
    const stranger=await member(),payer=await member(),p=await report(stranger,"STOLEN.TEST",{payerPhone:payer.phone});await codes.approvePayment(p.id,fields("STOLEN.TEST"),"owner");
    assert.equal((await payments.submit(payer,{planId,payerPhone:payer.phone,network:"airtel",transactionId:"STOLENTEST",amount:5000,accepted:true},jpeg())).status,"duplicate");
    assert.equal((await codes.reversePayment(p.id,"wrong-account","owner")).status,"saved");assert.equal((await codes.manual({phone:payer.phone,planId,amountReceivedUgx:5000,note:`for P${p.reference}`},"owner")).status,"created");
    assert.equal((await codes.manual({phone:payer.phone,planId,network:"airtel",transactionRef:"STOLENTEST",amountReceivedUgx:5000,note:"Synthetic duplicate"},"owner")).status,"duplicate");
    const [paid,manual]=await db.query(tx=>Promise.all([tx.paymentSubmission.aggregate({where:{id:p.id,status:"approved"},_sum:{amountReceivedUgx:true}}),tx.accessCode.aggregate({where:{accountId:payer.accountId,source:"manual"},_sum:{amountReceivedUgx:true}})]));assert.equal((paid._sum.amountReceivedUgx??0)+(manual._sum.amountReceivedUgx??0),5000);
  });
  await t.test("review checks and reject store decisions and purge images only when requested",async()=>{
    const payer=await member(),stranger=await member(),a=await report(stranger,"CHECKTEST",{payerPhone:payer.phone}),b=await report(payer,"CHECKTEST");const queue=await review.list();const card=queue.payments.find(p=>p.id===a.id);assert.equal(card.checks.filter(c=>c.tone==="warning").length,4);
    const result=await review.reject(a.id,"unreadable","Synthetic text",true,"owner");assert.equal(result.status,"saved");assert.equal(result.notification,"sent");assert.equal(notifications.rejections.at(-1).phone,stranger.phone);assert.notEqual(notifications.rejections.at(-1).phone,payer.phone);assert.equal(await review.screenshot(a.id),null);assert.ok(await review.screenshot(b.id));const sends=notifications.rejections.length;assert.equal((await review.reject(a.id,"other","",false,"owner")).status,"refused");assert.equal(notifications.rejections.length,sends);
    const rows=await db.query(tx=>tx.ownerAuditEvent.findMany({where:{action:"payment_rejected"}}));assert.equal(rows.length,1);assert.ok(!JSON.stringify(rows[0].details).includes("Synthetic text"));
  });
  await t.test("HTTP approval grants access once without delivery credentials; management preserves audit",async()=>{
    const {createCodesHandlers,createReviewHandlers}=await import("../src/server/admin/codes-http.ts");
    const who=await member(),row=await report(who,"HTTPONLYONCE");
    const services={database:db,config:{...config,production:true}};
    const context=body=>({services,owner:{username:"owner"},request:new Request(`http://localhost/api/admin/payments/${row.id}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)})});
    const fields={action:"approve",planId,network:"mtn",transactionId:"HTTPONLYONCE",amount:5000};
    const handlers=createReviewHandlers({notifications:silentPaymentNotifications});const r=await handlers.POST(context(fields));assert.equal(r.status,201);const reply=await r.json();assert.equal(reply.status,"approved");assert.equal(reply.devicesUnlocked,1);assert.equal(reply.notification,"unavailable");assert.ok(!("delivery" in reply));assert.ok(!("code" in reply));
    const second=await handlers.POST(context(fields));assert.equal(second.status,409);
    const code=await db.query(tx=>tx.accessCode.findUniqueOrThrow({where:{paymentSubmissionId:row.id}}));
    await db.query(tx=>tx.subscriptionPlan.update({where:{id:planId},data:{name:"Changed plan",priceUgx:7000}}));
    assert.equal((await codes.extend(code.id,2,"owner")).status,"saved");assert.equal((await codes.revoke(code.id,"owner-revoked","owner")).status,"saved");
    const list=await createCodesHandlers().GET(context({}));const text=await list.text();assert.ok(!text.includes("codeHash"));assert.ok(!text.includes("codeSalt"));
    const audit=await db.query(tx=>tx.ownerAuditEvent.findMany({where:{accountId:who.accountId}}));for(const action of ["code_created","payment_approved","code_extended","code_revoked"])assert.ok(audit.some(a=>a.action===action),action);
  });

});
