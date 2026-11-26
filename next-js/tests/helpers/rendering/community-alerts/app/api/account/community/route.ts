import { createHash } from "node:crypto";
import { fixture, fixtureAccount } from "../../../fixture-state";

export async function POST(request: Request) {
  const account = fixtureAccount(request);
  if (!account) return Response.json({}, { status: 403 });
  const accountKey = createHash("sha256").update(account).digest("hex");
  const action = await request.json();
  const state = fixture.invitationAccounts.get(account) ?? { joined: false, invitedAt: null, claimId: null, pending: false };
  fixture.invitationAccounts.set(account, state);
  const status = () => ({ accountKey, joined: state.joined });
  if (action.action === "status") return Response.json(status());
  if (action.accountKey !== accountKey) return Response.json({}, { status: 403 });
  if (action.action === "reconcile") {
    state.joined = true;
    state.pending = false;
    return Response.json(status());
  }
  if (action.action === "claim") {
    const now = fixture.invitationTime ?? Date.now();
    const retryAt = state.invitedAt === null ? now : state.invitedAt + 86_400_000;
    if (state.joined || retryAt > now) return Response.json({ ...status(), invited: false, retryAt: new Date(retryAt).toISOString() });
    state.invitedAt = now;
    state.claimId = action.attemptId;
    state.pending = false;
    return Response.json({ ...status(), invited: true });
  }
  if (state.joined) return Response.json(status());
  if (action.attemptId !== state.claimId || action.action !== "attempt" && !state.pending) {
    return Response.json({}, { status: 409 });
  }
  state.pending = action.action === "attempt";
  state.joined = action.action === "yes";
  return Response.json(status());
}
