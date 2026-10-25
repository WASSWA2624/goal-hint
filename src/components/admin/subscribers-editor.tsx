"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { OwnerAccount, OwnerSubscriber } from "@/domain/owner-members";
import type { SubscriptionPlanView } from "@/domain/subscription-plans";
import { ChevronDownIcon, ChevronLeftIcon, UserIcon, UserPlusIcon } from "@/components/ui/icons";
import { Hint } from "./admin-form";
import { ActionNotices, ManualCodeForm, useCodeAction } from "./code-tools";
import { Drawer, EmptyPanel } from "./desk-styles";
import { SubscriberDirectory } from "./subscriber-directory";
import { SubscriberDetail } from "./subscriber-detail";
import { TemporaryPassword, type Revealed } from "./subscriber-credentials";
import { AccountColumn, BackLink, DrawerPanel, EmptyAccount, Workspace, WorkspaceTitle } from "./subscriber-styles";

export { PasswordReset, TemporaryPassword, type Revealed } from "./subscriber-credentials";

/**
 * The directory and the open account share one desk: side by side from desktop up, one at a time on phones (the
 * account then leads back with "Subscribers"). Drawers render their forms only while open.
 */
export function SubscribersEditor({ accounts, detail: selected, plans }: { accounts: readonly OwnerAccount[]; detail: OwnerSubscriber | null; plans: readonly SubscriptionPlanView[] }) {
  const router = useRouter(), action = useCodeAction();
  const [found, setFound] = useState<{ accounts: readonly OwnerAccount[]; source: readonly OwnerAccount[] } | null>(null), [search, setSearch] = useState("");
  const [filtering, setFiltering] = useState(false), [adminPhone, setAdminPhone] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Revealed | null>(null), [deletedId, setDeletedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false), addSummary = useRef<HTMLElement>(null);
  const credentialAccount = selected && !selected.erasedAt ? selected.id : null;
  const [previousAccount, setPreviousAccount] = useState(credentialAccount);
  // Query-only navigation keeps this editor mounted; credentials belong only to the currently open account.
  if (previousAccount !== credentialAccount) { setPreviousAccount(credentialAccount); setRevealed(null); }
  function closeAdding() { if (!action.busy) { setAdding(false); requestAnimationFrame(() => addSummary.current?.focus()); } }
  const detail = selected?.id === deletedId ? null : selected;
  const currentAccounts = new Map(accounts.map(account => [account.id, account]));
  const listedAccounts = (found?.accounts ?? accounts).filter(account => account.id !== deletedId)
    .map(account => found?.source === accounts ? account : currentAccounts.get(account.id) ?? account);
  return <Workspace $selected={!!detail} data-subscriber-workspace data-analytics-ignore>
    <WorkspaceTitle><h1>Subscribers</h1></WorkspaceTitle>
    <SubscriberDirectory accounts={listedAccounts} selectedId={detail?.id ?? null} compact={!!detail}
      search={search} onSearchChange={setSearch} filtering={filtering} busy={action.busy} adminPhone={adminPhone}
      onSearch={async query => {
        if (action.busy) return;
        const reply = await action.send("/api/admin/subscribers", { search: query }, "", false);
        if (reply.ok) {
          setFound({ accounts: reply.body.accounts as OwnerAccount[], source: accounts }); setFiltering(query.trim() !== "");
          setAdminPhone(typeof reply.body.adminPhone === "string" ? reply.body.adminPhone : null);
        }
      }}>
      <DrawerPanel as="div">
        <Drawer open={adding} onToggle={event => { const open = event.currentTarget.open; setAdding(open); if (open) setRevealed(null); }}
          onKeyDown={event => { if (event.key === "Escape" && adding && !event.defaultPrevented) { event.preventDefault(); closeAdding(); } }}>
          <summary ref={addSummary} aria-controls="subscriber-add" onClick={event => { if (action.busy) event.preventDefault(); }}>
            <UserPlusIcon />Grant access / add subscriber<ChevronDownIcon />
          </summary>
          {adding && <div id="subscriber-add" data-subscriber-add>
            <Hint as="p">A new number creates an account with access.</Hint>
            <ManualCodeForm plans={plans} action={action} compact onSaved={() => { closeAdding(); setFound(null); setFiltering(false); setSearch(""); setAdminPhone(null); }} />
          </div>}
        </Drawer>
      </DrawerPanel>
    </SubscriberDirectory>
    <AccountColumn $quiet={!detail && !action.notice && !action.message}>
      {detail && <BackLink href="/admin/subscribers" prefetch={false}><ChevronLeftIcon />Subscribers</BackLink>}
      <ActionNotices action={action} />
      {revealed && detail && revealed.accountId === detail.id && !detail.erasedAt && <TemporaryPassword key={revealed.password} value={revealed} done={() => setRevealed(null)} />}
      {detail ? <SubscriberDetail key={detail.id} account={detail} plans={plans} action={action} onReveal={setRevealed}
        onDeleted={() => { setDeletedId(detail.id); setRevealed(null); router.replace("/admin/subscribers", { scroll: false }); }} />
        : <EmptyAccount as="div"><EmptyPanel><UserIcon /><h2>Select an account</h2><p>Find a subscriber to manage their access, login and details.</p></EmptyPanel></EmptyAccount>}
    </AccountColumn>
  </Workspace>;
}
