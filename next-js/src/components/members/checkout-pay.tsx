"use client";

import { useId, type ReactNode } from "react";
import { Button, ButtonLink } from "@/components/ui/controls";
import { CardIcon, CheckIcon, ChevronLeftIcon, ChevronRightIcon, CopyIcon, PhoneIcon } from "@/components/ui/icons";
import { localUgandaPhone } from "@/domain/phone";
import type { PublicSubscriptionSettings } from "@/domain/public-subscription-settings";
import { formatPlanLength, formatUgx, type SubscriptionPlanView } from "@/domain/subscription-plans";
import { manualPaymentProvider } from "@/domain/subscription-settings";
import type { CheckoutDraft } from "./checkout-draft";
import type { CheckoutPayPreview } from "./checkout-parts";
import { MobileMoneyLogo } from "./mobile-money-logo";
import {
  PayAmount, PayColumns, PayEyebrow, PayFooter, PayGroupHeading, PayHelper, PayLayout, PayMethods, PayNote,
  PayPackage, PayPackageGroup, PayProvider, PayProviderGrid, PayProviderMark, PayProviders, PayRecipient, PayRecipientActions, PayRewards,
  PayTextAction, PayTransfer, PayTransferHeading, PayTransferOverview, PayTransferSlot, PayWallet,
} from "./checkout-pay-styles";

const providers = [{ method: "mtn", name: "MTN MoMo" }, { method: "airtel", name: "Airtel Money" }] as const;

type CheckoutPayProps = {
  plan: SubscriptionPlanView | undefined;
  settings: PublicSubscriptionSettings;
  method: CheckoutDraft["method"];
  useWallet: boolean;
  walletUgx: number;
  availableWalletUgx: number;
  availableEarnedDays: number;
  lastProvider: string | null;
  disabled: boolean;
  flutterwaveAvailable: boolean;
  onMethodChange: (method: "mtn" | "airtel" | "wallet" | "flw", selected: boolean) => void;
  onChangePackage: () => void;
  onContinue: () => void;
  onRedeem: () => void;
  topUp: { href: string; label: string; shortfall: string } | null;
  children: ReactNode;
};

/** Presentation is shared across breakpoints; the checkout owner retains drafts and confirmation. */
export function CheckoutPay({ plan, settings, method, useWallet, walletUgx, availableWalletUgx,
  availableEarnedDays, lastProvider, disabled, flutterwaveAvailable, onMethodChange, onChangePackage, onContinue, onRedeem, topUp, children }: CheckoutPayProps) {
  const id = useId();
  const walletOnly = method === "wallet" && !!plan && walletUgx === plan.priceUgx && walletUgx <= availableWalletUgx;
  const selectedProvider = providers.find(provider => provider.method === method);
  const automatic = method === "flw" && flutterwaveAvailable;
  const hasManualProvider = providers.some(provider => !manualPaymentProvider(settings, provider.method).reason);
  const walletCanPay = !!plan && (availableWalletUgx >= plan.priceUgx || hasManualProvider);
  const methodReady = automatic || walletOnly || !!selectedProvider && !manualPaymentProvider(settings, selectedProvider.method).reason;
  return <PayLayout data-checkout-pay>
    <PayHelper>Choose how you’d like to pay.</PayHelper>
    <PayColumns>
      <PayPackageGroup aria-labelledby={`${id}-package-heading`} data-pay-package-group>
        <PayGroupHeading id={`${id}-package-heading`} data-pay-package-heading>Your package</PayGroupHeading>
        <PayPackage data-pay-package>
          <strong data-pay-package-part="name" title={plan?.name ?? "Choose a package"}>{plan?.name ?? "Choose a package"}</strong>
          <span data-pay-package-part="duration">{plan ? formatPlanLength(plan.durationDays) : "—"}</span>
          <strong data-pay-package-part="amount">{plan ? formatUgx(plan.priceUgx) : "—"}</strong>
          <PayTextAction type="button" variant="quiet" disabled={disabled} onClick={onChangePackage} data-pay-package-part="change">Change</PayTextAction>
        </PayPackage>
      </PayPackageGroup>
      <PayMethods aria-label="Payment methods" data-pay-methods>
        <PayProviders disabled={disabled}>
          <legend data-pay-methods-heading>Mobile Money</legend>
          <PayProviderGrid>{providers.map(provider => {
            const unavailable = manualPaymentProvider(settings, provider.method).reason;
            return <PayProvider key={provider.method} data-pay-provider={provider.method}>
              <input type="radio" name="checkout-method" value={provider.method} aria-label={provider.name}
                aria-describedby={unavailable ? `${id}-${provider.method}-unavailable` : undefined}
                checked={method === provider.method} disabled={disabled || !!unavailable}
                onChange={() => onMethodChange(provider.method, true)} />
              <PayProviderMark><MobileMoneyLogo network={provider.method} /></PayProviderMark>
              <strong>{provider.name}</strong>
              {unavailable && <small id={`${id}-${provider.method}-unavailable`}>{unavailable}</small>}
            </PayProvider>;
          })}
            {flutterwaveAvailable && <PayProvider data-pay-provider="flw">
              <input type="radio" name="checkout-method" value="flw" aria-label="Flutterwave"
                checked={automatic} disabled={disabled} onChange={() => onMethodChange("flw", true)} />
              <span><CardIcon /></span><strong>Flutterwave</strong>
            </PayProvider>}
          </PayProviderGrid>
          {walletOnly ? <PayNote>Wallet covers this payment. Select a provider to use Mobile Money instead.</PayNote>
            : selectedProvider && lastProvider === method && <PayNote data-pay-remembered>Selected from your last subscription payment.</PayNote>}
        </PayProviders>
        {availableWalletUgx > 0 && <div data-pay-wallet>
          <PayWallet><CardIcon /><span><strong>Use wallet balance</strong><small>{formatUgx(availableWalletUgx)} available</small></span>
            <input type="checkbox" name="checkout-wallet" checked={useWallet} disabled={disabled || !walletCanPay}
              onChange={event => onMethodChange("wallet", event.target.checked)} />
          </PayWallet>
          <PayNote>{plan && availableWalletUgx >= plan.priceUgx ? "Your balance can cover the full package."
            : hasManualProvider ? "Apply your balance and pay the rest with Mobile Money." : "Your balance cannot cover the full package."}</PayNote>
        </div>}
        {topUp && !disabled && <PayRewards>
          <PayNote>{topUp.shortfall}</PayNote>
          <ButtonLink href={topUp.href} variant="quiet" prefetch={false} data-pay-wallet-top-up>{topUp.label}<ChevronRightIcon /></ButtonLink>
        </PayRewards>}
        {availableEarnedDays > 0 && <PayRewards data-pay-earned-days>
          <PayNote>{availableEarnedDays} earned {availableEarnedDays === 1 ? "day" : "days"} available</PayNote>
          <PayTextAction type="button" variant="quiet" disabled={disabled} onClick={onRedeem}>Redeem earned days<ChevronRightIcon /></PayTextAction>
        </PayRewards>}
      </PayMethods>
      <PayTransferSlot data-pay-transfer-slot>{children}</PayTransferSlot>
    </PayColumns>
    <PayFooter>
      <PayTextAction type="button" variant="quiet" disabled={disabled} onClick={onChangePackage}><ChevronLeftIcon />Back</PayTextAction>
      <div><Button type="button" disabled={disabled || !plan || !methodReady} onClick={onContinue} data-pay-continue>
        {walletOnly || automatic ? "Review payment" : "I’ve paid — continue"}<ChevronRightIcon />
      </Button>{walletOnly && <PayNote>Confirm before using your wallet</PayNote>}</div>
    </PayFooter>
  </PayLayout>;
}

/** Keep provider fields mounted while the caller revalidates current server-provided values. */
export function CheckoutPayTransfer({ quote, availableWalletUgx, pending, failed, copied, onCopy }: {
  quote: CheckoutPayPreview;
  availableWalletUgx: number;
  pending: boolean;
  failed: boolean;
  copied: boolean;
  onCopy: () => void;
}) {
  const walletOnly = quote.method === "wallet" && quote.amountToSend === 0;
  const provider = providers.find(item => item.method === quote.method);
  return <PayTransfer aria-label="Payment details" aria-live="polite" aria-atomic="true" aria-busy={pending} data-payment-destination>
    {quote.method === "flw" ? <>
      <PayTransferHeading><CardIcon />Pay online with Flutterwave</PayTransferHeading>
      <PayAmount data-pay-amount>{formatUgx(quote.amountToSend)}</PayAmount>
      <PayNote>Review your purchase before opening the Flutterwave checkout.</PayNote>
      {failed && <PayNote role="alert">Payment details could not be confirmed. Check your connection and try again.</PayNote>}
    </> : walletOnly ? <>
      <PayTransferHeading><CardIcon />Pay from your wallet</PayTransferHeading>
      <PayAmount data-pay-amount>{formatUgx(quote.walletUgx)}</PayAmount>
      <PayNote>Your balance covers this package. No Mobile Money transfer is needed.</PayNote>
      <PayNote>{formatUgx(Math.max(0, availableWalletUgx - quote.walletUgx))} will remain in your wallet.</PayNote>
      {failed && <PayNote role="alert">Payment details could not be confirmed. Check your connection and try again.</PayNote>}
    </> : <>
      <PayTransferOverview data-pay-transfer-overview>
        <PayTransferHeading><PhoneIcon />{provider ? `Send with ${provider.name}` : "Amount to pay"}</PayTransferHeading>
        <PayEyebrow>Receiving number</PayEyebrow>
        <PayAmount data-pay-amount>{formatUgx(quote.amountToSend)}</PayAmount>
        <strong data-pay-recipient>{quote.recipient ? localUgandaPhone(quote.recipient) : "—"}</strong>
      </PayTransferOverview>
      {quote.walletUgx > 0 && <PayNote data-pay-wallet-breakdown>{formatUgx(quote.priceUgx)} package − {formatUgx(quote.walletUgx)} wallet</PayNote>}
      <PayRecipient>
        <PayRecipientActions>
          <strong>Names: {quote.recipientName ?? "—"}</strong>
          <Button type="button" variant="secondary" disabled={pending || failed || !provider || !quote.recipient} onClick={onCopy}
            aria-label={copied ? "Number copied" : `Copy ${provider?.name ?? "payment"} receiving number`}>
            {copied ? <CheckIcon /> : <CopyIcon />}{copied ? "Copied" : "Copy"}
          </Button>
        </PayRecipientActions>
        {failed && <PayNote role="alert">Payment details could not be confirmed. Check your connection and try again.</PayNote>}
        {!failed && (!provider || !quote.recipient) && <PayNote role="status">Choose an available payment method to view its receiving details.</PayNote>}
      </PayRecipient>
    </>}
  </PayTransfer>;
}
