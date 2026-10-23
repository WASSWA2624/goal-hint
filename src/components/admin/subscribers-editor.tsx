"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import styled from "styled-components";
import type { OwnerAccount, OwnerSubscriber } from "@/domain/owner-members";
import type { SubscriptionPlanView } from "@/domain/subscription-plans";
import { SearchIcon, UserIcon, UserPlusIcon } from "@/components/ui/icons";
import { ActionButton } from "./admin-form";
import { ActionNotices, ManualCodeForm, useCodeAction } from "./code-tools";
import { SubscriberDirectory } from "./subscriber-directory";
import { SubscriberDetail } from "./subscriber-detail";
import { TemporaryPassword, type Revealed } from "./subscriber-credentials";
import { DetailPanel, SectionHeader } from "./subscriber-styles";

export { PasswordReset, TemporaryPassword, type Revealed } from "./subscriber-credentials";

/** Search and account management share one workspace; only the selected task is expanded. */
export function SubscribersEditor({ accounts, detail: selected, plans }: { accounts: readonly OwnerAccount[]; detail: OwnerSubscriber | null; plans: readonly SubscriptionPlanView[] }) {
  const router = useRouter(), action = useCodeAction();
  const [found, setFound] = useState<readonly OwnerAccount[] | null>(null), [search, setSearch] = useState("");
  const [filtering, setFiltering] = useState(false), [adminPhone, setAdminPhone] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Revealed | null>(null), [deletedId, setDeletedId] = useState<string | null>(null);
  const [browsing, setBrowsing] = useState(false), [adding, setAdding] = useState(false);
  const addTrigger = useRef<HTMLButtonElement>(null), addHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (adding) addHeading.current?.focus(); }, [adding]);
  function closeAdding() { if (!action.busy) { setAdding(false); requestAnimationFrame(() => addTrigger.current?.focus()); } }
  const detail = selected?.id === deletedId ? null : selected;
  const currentAccounts = new Map(accounts.map(account => [account.id, account]));
  const listedAccounts = (found ?? accounts).filter(account => account.id !== deletedId).map(account => currentAccounts.get(account.id) ?? account);
  return <Workspace data-subscriber-workspace data-analytics-ignore>
    <WorkspaceTools>
      {detail && <FindButton type="button" disabled={action.busy} aria-expanded={browsing} aria-controls="subscriber-directory"
        onClick={() => setBrowsing(value => !value)}><SearchIcon />Find account</FindButton>}
      <ActionButton ref={addTrigger} type="button" $variant={adding ? "secondary" : "primary"} disabled={action.busy} aria-expanded={adding} aria-controls="subscriber-add"
        onClick={() => { setAdding(value => !value); setRevealed(null); }}><UserPlusIcon />Add subscriber</ActionButton>
    </WorkspaceTools>
    {adding && <DetailPanel id="subscriber-add" data-subscriber-add onKeyDown={event => { if (event.key === "Escape") closeAdding(); }}>
      <SectionHeader><div><h2 ref={addHeading} tabIndex={-1}>Grant access / add subscriber</h2><p>A new number creates an account with access.</p></div>
        <ActionButton type="button" disabled={action.busy} onClick={closeAdding}>Close</ActionButton></SectionHeader>
      <ManualCodeForm plans={plans} action={action} compact onSaved={() => { closeAdding(); setFound(null); setFiltering(false); setSearch(""); setAdminPhone(null); }} />
    </DetailPanel>}
    <WorkspaceGrid $selected={!!detail}>
      <DirectoryArea id="subscriber-directory" $selected={!!detail} $open={browsing} aria-label="Find subscriber">
        <SubscriberDirectory accounts={listedAccounts} selectedId={detail?.id ?? null} compact={!!detail}
          search={search} onSearchChange={setSearch} filtering={filtering} busy={action.busy} adminPhone={adminPhone}
          onSearch={async query => {
            if (action.busy) return;
            const reply = await action.send("/api/admin/subscribers", { search: query });
            if (reply.ok) {
              setFound(reply.body.accounts as OwnerAccount[]); setFiltering(query.trim() !== "");
              setAdminPhone(typeof reply.body.adminPhone === "string" ? reply.body.adminPhone : null);
            }
          }} />
      </DirectoryArea>
      <Content>
        <ActionNotices action={action} />
        {revealed && detail && revealed.accountId === detail.id && !detail.erasedAt && <TemporaryPassword key={revealed.password} value={revealed} done={() => setRevealed(null)} />}
        {detail ? <SubscriberDetail key={detail.id} account={detail} plans={plans} action={action} onReveal={setRevealed}
          onDeleted={() => { setDeletedId(detail.id); setRevealed(null); router.replace("/admin/subscribers", { scroll: false }); }} />
          : !adding && <ChooseAccount><UserIcon /><h2>Select an account</h2><p>Find a subscriber to manage their access, login and details.</p></ChooseAccount>}
      </Content>
    </WorkspaceGrid>
  </Workspace>;
}

const Workspace = styled.div`display: grid; gap: 12px; min-inline-size: 0;`;
const WorkspaceTools = styled.div`
  display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px;
  button { min-block-size: 44px; gap: 6px; padding-inline: 10px; font-size: 0.8125rem; border-radius: 0; }
  svg { inline-size: 17px; block-size: 17px; flex: none; }
  @media(max-width: 540px) { > button { flex: 1 1 auto; } }
`;
const FindButton = styled(ActionButton)`@media(min-width: 1000px) { display: none; }`;
const WorkspaceGrid = styled.div<{ $selected: boolean }>`
  display: grid; gap: 16px; min-inline-size: 0; align-items: start;
  @media(min-width: 1000px) { grid-template-columns: ${({ $selected }) => $selected ? "19rem minmax(0, 1fr)" : "minmax(0, 1fr)"}; }
`;
const DirectoryArea = styled.aside<{ $selected: boolean; $open: boolean }>`
  min-inline-size: 0;
  @media(max-width: 999px) { display: ${({ $selected, $open }) => !$selected || $open ? "block" : "none"}; }
`;
const Content = styled.div`display: grid; gap: 12px; min-inline-size: 0; &:empty { display: none; }`;
const ChooseAccount = styled(DetailPanel)`
  align-items: center; text-align: center; padding: 24px; color: ${({ theme }) => theme.color.mutedText};
  > svg { margin-inline: auto; inline-size: 28px; block-size: 28px; }
  h2 { color: ${({ theme }) => theme.color.text}; }
`;
