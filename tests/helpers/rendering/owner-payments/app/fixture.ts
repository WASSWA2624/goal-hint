import "server-only";
import { normalizePhone } from "@/domain/phone";
import type { OwnerAccount } from "@/domain/owner-members";
import type { AnalyticsServices } from "@/server/analytics/analytics-http";
export const planId="00000000-0000-4000-8000-000000000001", accountId="00000000-0000-4000-8000-000000000100", paymentId="00000000-0000-4000-8000-000000000200";
const at=new Date("2026-10-19T09:00:00Z"), end=new Date("2026-10-26T09:00:00Z");
const plan={id:planId,name:"Weekly",durationDays:7,priceUgx:5000,active:true,sortOrder:0,createdAt:at,updatedAt:at};
const payment={id:paymentId,reference:"TEST",accountId,account:{phone:"256700000101"},payerPhone:"256700000102",claimedNetwork:"mtn",claimedTxnRef:"TEST1234",claimedTxnKey:"TEST1234",claimedAmountUgx:5000,planId,planName:"Weekly",priceUgx:5000,submittedAt:at,status:"pending",imageSha256:null,screenshot:null,transactionRef:null};
const code={id:"00000000-0000-4000-8000-000000000300",accountId,reference:"CODE",planName:"Weekly",durationDays:7,extensionDays:0,startsAt:at,endsAt:end,revokedAt:null,source:"payment",account:{phone:"256700000101"}};
const account = { id: accountId, phone: "256700000101", blockedAt: null, blockedReason: null, ownerNote: "Synthetic owner note",
  erasedAt: null, lastSignInAt: new Date("2026-10-23T09:42:00Z"), trialRequestedAt: at, passwordResetRequestedAt: at };
const accountRows = [account,
 { ...account, id: "00000000-0000-4000-8000-000000000102", phone: "256700000118", lastSignInAt: new Date("2026-10-23T07:15:00Z"), trialRequestedAt: null, passwordResetRequestedAt: null },
 { ...account, id: "00000000-0000-4000-8000-000000000103", phone: "256700000204", lastSignInAt: new Date("2026-10-22T18:32:00Z"), blockedAt: new Date("2026-10-22T19:00:00Z"), blockedReason: "Synthetic account review", trialRequestedAt: null, passwordResetRequestedAt: null },
 { ...account, id: "00000000-0000-4000-8000-000000000104", phone: null, lastSignInAt: new Date("2026-10-20T14:05:00Z"), erasedAt: new Date("2026-10-21T08:00:00Z"), ownerNote: null, trialRequestedAt: null, passwordResetRequestedAt: null },
 { ...account, id: "00000000-0000-4000-8000-000000000105", phone: "447700900123", lastSignInAt: new Date("2026-10-18T11:20:00Z"), trialRequestedAt: null, passwordResetRequestedAt: null },
 { ...account, id: "00000000-0000-4000-8000-000000000106", phone: "254700000105", lastSignInAt: new Date("2026-10-16T06:10:00Z"), trialRequestedAt: null, passwordResetRequestedAt: null },
];
export const subscriberAccounts: readonly OwnerAccount[] = accountRows.map(row => ({ id: row.id, phone: row.phone,
 status: row.erasedAt ? "erased" : row.blockedAt ? "blocked" : "open", lastSignInAt: row.lastSignInAt.toISOString() }));
export function searchSubscribers(value: string) {
 const phone = normalizePhone(value);
 return value ? subscriberAccounts.filter(row => row.phone === phone && phone !== null) : subscriberAccounts;
}
type AccountQuery = { where?: { phone?: string | { in?: string[] }; passwordResetRequestedAt?: unknown; trialRequestedAt?: unknown } };
const ownedRows = <T extends { accountId: string }>(rows: T[], query?: { where?: { accountId?: string } }) => query?.where?.accountId
 ? rows.filter(row => row.accountId === query.where!.accountId) : rows;
function createClient(emptySubscribers: boolean) {return {
 $executeRaw:async()=>0,
 $queryRaw:async()=>[{total:1n}],
 memberSession:{findMany:async(query?:{where?:{accountId?:string}})=>query?.where?.accountId && query.where.accountId!==accountId ? [] : [{createdAt:at,lastSeenAt:at,expiresAt:end}]},
 subscriptionPlan:{findMany:async()=>[plan]},
 paymentSubmission:{findMany:async(query?:{where?:{accountId?:string}})=>ownedRows([payment],query),count:async()=>1,aggregate:async()=>({_sum:{amountReceivedUgx:5000}})},
 memberAccount:{findUnique:async(query:{where:{id:string}})=>accountRows.find(row=>row.id===query.where.id)??null,findMany:async(query:AccountQuery={})=>{
  const where=query.where;
  if(where?.passwordResetRequestedAt)return [account];
  if(where?.trialRequestedAt)return [account];
  const rows=emptySubscribers?[]:accountRows;
  if(typeof where?.phone==="string")return rows.filter(row=>row.phone===where.phone);
  const phones=where?.phone?.in;
  return phones?rows.filter(row=>row.phone!==null&&phones.includes(row.phone)):rows;
 }},
 ownerAuditEvent:{findMany:async()=>[{id:1n,at,actor:"synthetic-owner",action:"code_created",accountId,targetType:"access-code",targetId:code.id,details:{}}],count:async()=>1},rateLimitBucket:{findMany:async()=>[]},
 accessCode:{findMany:async(query?:{where?:{accountId?:string}})=>ownedRows([code],query),aggregate:async()=>({_sum:{amountReceivedUgx:3000}}),count:async()=>1},
 subscriptionSettings:{findUnique:async()=>({paymentNumbersChangedAt:at})}};}
export function seed({emptySubscribers=false}:{emptySubscribers?:boolean}={}){const client=createClient(emptySubscribers);(globalThis as typeof globalThis & {goalHintAnalytics?:Promise<AnalyticsServices>}).goalHintAnalytics=Promise.resolve({config:{production:false,usingDevelopmentCredentials:false,cookies:{session:"synthetic-owner"}},database:{query:async(run:(client:unknown)=>unknown)=>run(client)},auth:{verify:async()=>({username:"synthetic-owner",expiresAt:end})}} as unknown as AnalyticsServices);}
