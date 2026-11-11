"use client";

import styled from "styled-components";
import { ButtonLink } from "@/components/ui/controls";
import { PlusIcon } from "@/components/ui/icons";
import { Stack } from "@/components/ui/layout";
import { walletTopUpHref } from "@/domain/account-navigation";
import type { PaymentStatus } from "@/domain/payment";
import type { SubscriptionPlanView } from "@/domain/subscription-plans";
import { formatCredit, type CreditView } from "@/domain/wallet";
import { createMessages } from "@/i18n/messages";
import { AccountFine } from "./account-overview";
import { AccountPanel } from "./account-workspace";
import { WalletAutoRenewal, WalletHistory } from "./credit-controls";
import { PaymentNotice, type StatusSettings } from "./payment-status";

const Balance = styled.p`
  font-size: ${({ theme }) => theme.typography.scale.section};
  font-weight: ${({ theme }) => theme.typography.weight.heavy};
  font-variant-numeric: tabular-nums;
`;

export function AccountWallet({ locale, credit, topUpStatus, contact, phone, returnTo, topUpOpen, salesOpen, plans, acceptedTerms, active }: {
  locale: string; credit: CreditView | null; topUpStatus: PaymentStatus | null; contact: StatusSettings; phone: string;
  returnTo: string | null; topUpOpen: boolean; salesOpen: boolean; plans: readonly SubscriptionPlanView[];
  acceptedTerms: boolean; active: boolean;
}) {
  const m = createMessages(locale);
  return <>
    <AccountPanel title={m.text("wallet.balance")} data-account-wallet-balance
      actions={topUpOpen && <ButtonLink href={walletTopUpHref(locale, returnTo)} prefetch={false} data-credit-add>
        <PlusIcon />{m.text("wallet.topUp")}
      </ButtonLink>}>
      <Stack $gap="sm">
        {credit ? <>
          <Balance>{formatCredit(credit.balanceUgx)}</Balance>
          {credit.balanceUgx < 0 && <AccountFine>{m.text("credit.negative")}</AccountFine>}
          {credit.balanceUgx > credit.availableBalanceUgx &&
            <AccountFine>{m.text("wallet.availableBalance", { amount: formatCredit(credit.availableBalanceUgx) })}</AccountFine>}
        </> : <AccountFine role="status">{m.text("wallet.unavailable")}</AccountFine>}
        <AccountFine>{m.text("wallet.noWithdrawals")}</AccountFine>
        {!topUpOpen && <AccountFine>{m.text("wallet.topUpUnavailable")}</AccountFine>}
      </Stack>
    </AccountPanel>
    <PaymentNotice locale={locale} status={topUpStatus} settings={contact} phone={phone} />
    {credit && <>
      <AccountPanel title={m.text("wallet.autoRenewal")} data-wallet-auto-renewal>
        <WalletAutoRenewal locale={locale} credit={credit} plans={plans} salesOpen={salesOpen} acceptedTerms={acceptedTerms} active={active} />
      </AccountPanel>
      <AccountPanel title={m.text("wallet.activity")} data-wallet-activity>
        <WalletHistory locale={locale} credit={credit} />
      </AccountPanel>
    </>}
  </>;
}
