import "server-only";
import type { AnalyticsServices } from "@/server/analytics/analytics-http";
export const planId="00000000-0000-4000-8000-000000000001", accountId="00000000-0000-4000-8000-000000000100", paymentId="00000000-0000-4000-8000-000000000200";
const at=new Date("2026-10-19T09:00:00Z"), end=new Date("2026-10-26T09:00:00Z");
const plan={id:planId,name:"Weekly",durationDays:7,priceUgx:5000,active:true,sortOrder:0,createdAt:at,updatedAt:at};
const payment={id:paymentId,reference:"TEST",accountId,account:{phone:"256700000101"},payerPhone:"256700000102",claimedNetwork:"mtn",claimedTxnRef:"TEST1234",claimedTxnKey:"TEST1234",claimedAmountUgx:5000,planId,planName:"Weekly",priceUgx:5000,submittedAt:at,status:"pending",imageSha256:null,screenshot:null,transactionRef:null};
const code={id:"00000000-0000-4000-8000-000000000300",accountId,reference:"CODE",planName:"Weekly",durationDays:7,extensionDays:0,startsAt:at,endsAt:end,revokedAt:null,source:"payment",account:{phone:"256700000101"}};
const account = { id: accountId, phone: "256700000101", blockedAt: null, blockedReason: null, ownerNote: "Synthetic owner note",
  erasedAt: null, lastSignInAt: at, trialRequestedAt: at, passwordResetRequestedAt: at };
const client={
 $executeRaw:async()=>0,
 $queryRaw:async()=>[{total:1n}],
 memberSession:{findMany:async()=>[{createdAt:at,lastSeenAt:at,expiresAt:end}]},subscriptionPlan:{findMany:async()=>[plan]},paymentSubmission:{findMany:async()=>[payment],count:async()=>1,aggregate:async()=>({_sum:{amountReceivedUgx:5000}})},memberAccount:{findUnique:async()=>account,findMany:async()=>[account]},ownerAuditEvent:{findMany:async()=>[{id:1n,at,actor:"synthetic-owner",action:"code_created",accountId,targetType:"access-code",targetId:code.id,details:{}}],count:async()=>1},rateLimitBucket:{findMany:async()=>[]},accessCode:{findMany:async()=>[code],aggregate:async()=>({_sum:{amountReceivedUgx:3000}}),count:async()=>1},subscriptionSettings:{findUnique:async()=>({paymentNumbersChangedAt:at})}};
export function seed(){(globalThis as typeof globalThis & {goalHintAnalytics?:Promise<AnalyticsServices>}).goalHintAnalytics=Promise.resolve({config:{production:false,usingDevelopmentCredentials:false,cookies:{session:"synthetic-owner"}},database:{query:async(run:(client:unknown)=>unknown)=>run(client)},auth:{verify:async()=>({username:"synthetic-owner",expiresAt:end})}} as unknown as AnalyticsServices);}
