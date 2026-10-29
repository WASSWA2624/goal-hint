"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { OwnerAccount, OwnerSubscriber } from "@/domain/owner-members";
import type { SubscriptionPlanView } from "@/domain/subscription-plans";
import { ChevronLeftIcon, UserIcon, UserPlusIcon } from "@/components/ui/icons";
import { useDesktopLayout } from "@/components/ui/use-desktop-layout";
import { ActionButton, Hint } from "./admin-form";
import { ActionNotices, ManualCodeForm, useCodeAction } from "./code-tools";
import { SubscriberDirectory } from "./subscriber-directory";
import { SubscriberDetail } from "./subscriber-detail";
import type { Revealed } from "./subscriber-credentials";
import { AccountColumn, BackLink, Workspace, WorkspaceTitle } from "./subscriber-styles";
import { RecordBody, RecordCard, RecordDetailHead, RecordEmpty, RecordFeedback, RecordFooter, RecordScroll } from "./record-workspace";

export { PasswordReset, TemporaryPassword, type Revealed } from "./subscriber-credentials";

/** One shared directory/detail workspace; credentials are retained only for the selected account. */
export function SubscribersEditor({ accounts, detail: selected, plans }: { accounts: readonly OwnerAccount[]; detail: OwnerSubscriber | null; plans: readonly SubscriptionPlanView[] }) {
  const router = useRouter(), action = useCodeAction(), desktop = useDesktopLayout();
  const [found, setFound] = useState<{ accounts: readonly OwnerAccount[]; source: readonly OwnerAccount[] } | null>(null), [search, setSearch] = useState("");
  const [filtering, setFiltering] = useState(false), [adminPhone, setAdminPhone] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Revealed | null>(null), [deletedId, setDeletedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false), addControl = useRef<HTMLButtonElement>(null), backControl = useRef<HTMLAnchorElement>(null);
  const credentialAccount = selected && !selected.erasedAt ? selected.id : null;
  const [previousAccount, setPreviousAccount] = useState(credentialAccount);
  // Query-only navigation keeps the editor mounted. A newly selected record must never inherit a password.
  if (previousAccount !== credentialAccount) { setPreviousAccount(credentialAccount); setRevealed(null); setAdding(false); }
  function closeAdding() {
    if (!action.busy) {
      setAdding(false);
      requestAnimationFrame(() => (desktop || !detail ? addControl.current : backControl.current)?.focus());
    }
  }
  const detail = selected?.id === deletedId ? null : selected;
  const currentAccounts = new Map(accounts.map(account => [account.id, account]));
  const listedAccounts = (found?.accounts ?? accounts).filter(account => account.id !== deletedId)
    .map(account => found?.source === accounts ? account : currentAccounts.get(account.id) ?? account);
  return <Workspace $selected={!!detail || adding} data-subscriber-workspace data-analytics-ignore>
    <WorkspaceTitle><h1>Subscribers</h1><ActionButton ref={addControl} type="button" disabled={action.busy} aria-expanded={adding} aria-controls="subscriber-add"
      onClick={() => { if (adding) closeAdding(); else { setAdding(true); setRevealed(null); } }}><UserPlusIcon />Grant access / add subscriber</ActionButton></WorkspaceTitle>
    {(action.notice || action.message) && <RecordFeedback><ActionNotices action={action} /></RecordFeedback>}
    <SubscriberDirectory accounts={listedAccounts} selectedId={!adding ? detail?.id ?? null : null} compact={!!detail || adding}
      search={search} onSearchChange={setSearch} filtering={filtering} busy={action.busy} adminPhone={adminPhone}
      onSearch={async query => {
        if (action.busy) return;
        const reply = await action.send("/api/admin/subscribers", { search: query }, "", false);
        if (reply.ok) {
          setFound({ accounts: reply.body.accounts as OwnerAccount[], source: accounts }); setFiltering(query.trim() !== "");
          setAdminPhone(typeof reply.body.adminPhone === "string" ? reply.body.adminPhone : null);
        }
      }} />
    <AccountColumn $quiet={!detail && !adding}>
      {adding ? <RecordCard data-subscriber-add id="subscriber-add">
        <RecordScroll>
          <RecordDetailHead><h2>Grant access / add subscriber</h2><ActionButton type="button" disabled={action.busy} onClick={closeAdding}><ChevronLeftIcon />Cancel</ActionButton></RecordDetailHead>
          <RecordBody><Hint as="p">A new number creates an account with access.</Hint>
            <ManualCodeForm formId="subscriber-add-form" externalActions={desktop} plans={plans} action={action} compact onSaved={() => {
              closeAdding(); setFound(null); setFiltering(false); setSearch(""); setAdminPhone(null);
            }} /></RecordBody>
        </RecordScroll>
        {desktop && <RecordFooter><ActionButton type="button" disabled={action.busy} onClick={closeAdding}>Cancel</ActionButton><ActionButton type="submit" form="subscriber-add-form" $variant="primary" disabled={action.busy}>Grant access manually</ActionButton></RecordFooter>}
      </RecordCard> : detail ? <SubscriberDetail key={detail.id} account={detail} plans={plans} action={action} onReveal={setRevealed}
        revealed={revealed?.accountId === detail.id && !detail.erasedAt ? revealed : null} onDismissReveal={() => setRevealed(null)}
        back={<BackLink ref={backControl} href="/admin/subscribers" prefetch={false}><ChevronLeftIcon />Subscribers</BackLink>}
        onDeleted={() => { setDeletedId(detail.id); setRevealed(null); router.replace("/admin/subscribers", { scroll: false }); }} />
        : <RecordCard><RecordScroll><RecordEmpty><UserIcon /><h2>Select an account</h2><p>Find a subscriber to manage their access, sign-in and details.</p></RecordEmpty></RecordScroll></RecordCard>}
    </AccountColumn>
  </Workspace>;
}
