import type { CheckoutSelection, CheckoutView } from "@/domain/checkout";
import type { SubscriptionPlanView } from "@/domain/subscription-plans";
import type { ScreenshotMetadata } from "@/domain/payment-screenshot";
import { manualPaymentProvider, type ManualPaymentSettings } from "../../domain/subscription-settings.ts";
import { decodeDraftProgress, readDraftMemory, readDraftProgress, writeDraftProgress } from "./draft-storage.ts";

export type CheckoutDraft = { requestKey: string; step: 0 | 1 | 2 | 3; purpose: CheckoutSelection["purpose"]; planId: string;
  usePackage?: boolean; mobileMethod?: "mtn" | "airtel" | undefined;
  method: CheckoutSelection["method"] | ""; useWallet: boolean; useReferral: boolean; walletUgx: string; referralDays: string; topUpUgx: string;
  transactionId: string; amountUgx: string; payerPhone: string; paidAt: string; text: string;
  extracted: Record<string, string | number | null>; originalText: string; accepted: boolean; attachingId: string | null; screenshot?: ScreenshotMetadata | null };

export function restoredCheckoutStep(step: CheckoutDraft["step"], { validPackage, methodAvailable, external, evidencePresent }:
  { validPackage: boolean; methodAvailable: boolean; external: boolean; evidencePresent: boolean }): CheckoutDraft["step"] {
  if (!validPackage) return 0;
  if (step >= 2 && !methodAvailable) return 1;
  if (step === 3 && external && !evidencePresent) return 2;
  return step === 2 && !external ? 3 : step;
}

/** Only preselect a transfer provider before evidence entry; wallet spending remains explicit. */
export function withCheckoutProvider(draft: CheckoutDraft, settings: ManualPaymentSettings, lastMethod: string | null): CheckoutDraft {
  if (draft.step >= 2 || draft.attachingId) return draft;
  const provider = [draft.method, draft.mobileMethod, lastMethod, "mtn", "airtel"].find(
    (method): method is "mtn" | "airtel" => (method === "mtn" || method === "airtel") && !manualPaymentProvider(settings, method).reason);
  const method = draft.method === "wallet" || draft.method === "referral" ? draft.method : provider ?? "";
  return method === draft.method && provider === draft.mobileMethod ? draft
    : { ...draft, method, mobileMethod: provider, accepted: false };
}

/** Apply current spendable balances to edits, restored drafts and balance refreshes. */
export function capCheckoutFunding(draft: CheckoutDraft, balances: Pick<CheckoutView, "availableWalletUgx" | "availableReferralDays">,
  plans: readonly Pick<SubscriptionPlanView, "id" | "priceUgx">[]): CheckoutDraft {
  const usePackage = draft.usePackage ?? draft.purpose !== "referral";
  const useWallet = usePackage && balances.availableWalletUgx > 0 && (draft.useWallet ?? Number(draft.walletUgx) > 0);
  const useReferral = balances.availableReferralDays > 0 && (draft.useReferral ?? Number(draft.referralDays) > 0);
  const purpose = draft.purpose === "topup" ? "topup" : usePackage ? "plan" : "referral";
  const price = purpose === "plan" ? plans.find(plan => plan.id === draft.planId)?.priceUgx ?? 0 : 0;
  const cap = (value: string, maximum: number) => value.trim() === "" ? "" : String(Math.min(maximum, Math.max(0, Math.floor(Number(value) || 0))));
  const walletUgx = purpose === "plan" ? cap(draft.walletUgx, Math.min(balances.availableWalletUgx, price)) : "0";
  const referralDays = cap(draft.referralDays, Math.min(365, balances.availableReferralDays));
  const method = purpose === "referral" ? "referral" : price > 0 && Number(walletUgx) === price ? "wallet"
    : draft.method === "wallet" || draft.method === "referral" ? "" : draft.method;
  return walletUgx === draft.walletUgx && referralDays === draft.referralDays && method === draft.method
    && useWallet === draft.useWallet && useReferral === draft.useReferral && purpose === draft.purpose
    ? draft : { ...draft, purpose, walletUgx, referralDays, method, useWallet, useReferral, accepted: false };
}

/** Package choice is independent of the payment method and referral redemption. */
export function chooseCheckoutPackage(draft: CheckoutDraft, selected: boolean,
  balances: Pick<CheckoutView, "availableWalletUgx" | "availableReferralDays">, plans: readonly Pick<SubscriptionPlanView, "id" | "priceUgx">[]): CheckoutDraft {
  return capCheckoutFunding({ ...draft, usePackage: selected, accepted: false }, balances, plans);
}

/** Wallet is an optional contribution; a provider settles any cash remainder. */
export function chooseCheckoutMethod(draft: CheckoutDraft, method: CheckoutSelection["method"], selected: boolean,
  balances: Pick<CheckoutView, "availableWalletUgx" | "availableReferralDays">, plans: readonly Pick<SubscriptionPlanView, "id" | "priceUgx">[]): CheckoutDraft {
  const price = plans.find(plan => plan.id === draft.planId)?.priceUgx ?? 0;
  if (method === "wallet") return capCheckoutFunding({ ...draft, purpose: "plan", usePackage: true, useWallet: selected,
    method: draft.method === "mtn" || draft.method === "airtel" ? draft.method : selected ? "wallet" : "",
    walletUgx: selected ? String(Math.min(balances.availableWalletUgx, price)) : "0", accepted: false }, balances, plans);
  if (method === "referral") return capCheckoutFunding({ ...draft, useReferral: selected,
    referralDays: selected ? String(Math.min(365, balances.availableReferralDays)) : "0", accepted: false }, balances, plans);
  const walletUgx = Number(draft.walletUgx) >= price ? "0" : draft.walletUgx;
  return capCheckoutFunding({ ...draft, purpose: draft.purpose === "topup" ? "topup" : "plan", usePackage: true, method, mobileMethod: method, walletUgx,
    useWallet: Number(draft.walletUgx) >= price ? false : draft.useWallet, accepted: false }, balances, plans);
}
type Stored = { draft: CheckoutDraft; image: Blob | null };
type CheckoutDraftKind = "plan" | "topup";
const savedMethod = (value: unknown): value is CheckoutDraft["method"] =>
  value === "" || value === "mtn" || value === "airtel" || value === "wallet" || value === "referral";
const savedAmount = (value: unknown) => typeof value === "string" && /^\d{0,9}$/u.test(value) ? value : "";
const isRequestKey = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9-]{36}$/u.test(value);

export function loadCheckoutDraft(scope: string, kind: CheckoutDraftKind, initial: CheckoutDraft): Stored | null {
  const inMemory = readDraftMemory<Stored>(scope, kind);
  if (inMemory) return inMemory;
  const stored = decodeDraftProgress(readDraftProgress(scope, kind));
  if (!stored || !isRequestKey(stored.requestKey) || typeof stored.planId !== "string" || stored.planId.length > 64 || !savedMethod(stored.method)) return null;
  const external = stored.method === "mtn" || stored.method === "airtel";
  return { image: null, draft: { ...initial, requestKey: stored.requestKey, planId: stored.planId,
    purpose: kind === "topup" ? "topup" : stored.purpose === "referral" ? "referral" : "plan",
    step: stored.step === 3 ? external ? 2 : 3 : stored.step === 2 || stored.step === 1 ? stored.step : 0,
    method: stored.method, mobileMethod: stored.mobileMethod === "mtn" || stored.mobileMethod === "airtel" ? stored.mobileMethod : undefined,
    usePackage: stored.usePackage === true, useWallet: stored.useWallet === true, useReferral: stored.useReferral === true,
    walletUgx: savedAmount(stored.walletUgx), referralDays: savedAmount(stored.referralDays), topUpUgx: savedAmount(stored.topUpUgx) } };
}

export function saveCheckoutDraft(scope: string, kind: CheckoutDraftKind, value: Stored) {
  const { requestKey, step, purpose, planId, usePackage, method, mobileMethod, useWallet, useReferral, walletUgx, referralDays, topUpUgx, attachingId } = value.draft;
  // A receipt attachment can resume in memory. Never restore its record ID or evidence from browser storage.
  writeDraftProgress(scope, kind, attachingId ? null : { requestKey, step, purpose, planId, usePackage,
    method, mobileMethod, useWallet, useReferral, walletUgx, referralDays, topUpUgx }, value);
}
