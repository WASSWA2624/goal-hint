"use client";

import { useEffect, useRef, useState } from "react";
import styled, { css } from "styled-components";
import Link from "@/components/navigation/navigation-link";
import { formatPhone } from "@/domain/phone";
import { formatPeriodEnd } from "@/domain/subscription-period";
import { ChevronLeftIcon, KeyIcon, PhoneIcon, SearchIcon, UserIcon } from "@/components/ui/icons";
import { useDesktopLayout } from "@/components/ui/use-desktop-layout";
import { media } from "@/styles/theme";
import { ActionButton, Hint } from "./admin-form";
import { ActionNotices, useCodeAction } from "./code-tools";
import { usePasswordRequestCount } from "./admin-page-state";
import { DeskColumn, EmptyPanel, MetaLine, Panel, PanelBody, TextAction } from "./desk-styles";
import { PasswordReset, TemporaryPassword, type Revealed } from "./subscriber-credentials";
import { RecordBody, RecordCard, RecordDetailHead, RecordDetails, RecordEmpty, RecordFeedback, RecordFooter, RecordHead, RecordItem,
  RecordItemMeta, RecordItemTitle, RecordList, RecordListFooter, RecordListScroll, RecordListTools, RecordScroll, RecordWorkspace } from "./record-workspace";

type Request = Readonly<{ id: string; phone: string; requestedAt: string }>;
const searchable = (value: string) => value.replace(/[\s()+.-]/gu, "").toLowerCase();

/** A selectable queue with a single reset form. Recovery passwords live only in the selected review. */
export function PasswordResetRequests({ requests }: { requests: readonly Request[] }) {
  const { setCount } = usePasswordRequestCount(), desktop = useDesktopLayout();
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const action = useCodeAction(async () => { setCount(value => value === null ? null : Math.max(0, value - 1)); });
  const [revealed, setRevealed] = useState<Revealed | null>(null), [handled, setHandled] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState(requests[0]?.id ?? ""), [opened, setOpened] = useState(false), [search, setSearch] = useState("");
  const pending = requests.filter(request => !handled.includes(`${request.id}:${request.requestedAt}`));
  const listed = pending.filter(request => !search || searchable(request.phone).includes(searchable(search)));
  const selected = listed.find(request => request.id === selectedId) ?? listed[0];
  const phone = revealed?.phone ?? selected?.phone, formId = selected ? `password-request-form-${selected.id}` : undefined;
  function choose(request: Request) {
    if (action.busy) return;
    setRevealed(null); setSelectedId(request.id); setOpened(true);
  }
  function done() { setRevealed(null); setOpened(false); }
  // Keep the existing phone workflow: each pending request owns its confirmation form.
  // Selection and one-time credentials remain above this responsive branch.
  if (!desktop) return <MobileDesk data-analytics-ignore>
    <RecordHead><h1>Password requests</h1><Hint as="p">Verify the member by phone, then set a temporary password and read it to them.</Hint></RecordHead>
    <ActionNotices action={action} />
    {revealed && <TemporaryPassword key={revealed.password} value={revealed} done={done} />}
    <DeskColumn>{pending.map(request => <Panel key={`${request.id}:${request.requestedAt}`} aria-labelledby={`password-request-${request.id}`}><PanelBody>
      <div><h2 id={`password-request-${request.id}`}>+{formatPhone(request.phone)}</h2><MetaLine>Requested {formatPeriodEnd(new Date(request.requestedAt))}</MetaLine></div>
      <Links><TextAction as={Link} href={`/admin/subscribers?accountId=${request.id}`} prefetch={false}><UserIcon />View account</TextAction>
        <TextAction as="a" href={`tel:+${request.phone}`}><PhoneIcon />Call member</TextAction></Links>
      <PasswordReset path={`/api/admin/subscribers/${request.id}`} action={action} isActive={() => mounted.current} reveal={value => {
        setRevealed({ ...value, phone: request.phone }); setHandled(current => [...current, `${request.id}:${request.requestedAt}`]);
      }} />
    </PanelBody></Panel>)}{!pending.length && <Panel><EmptyPanel><KeyIcon /><strong>No pending password requests.</strong></EmptyPanel></Panel>}</DeskColumn>
  </MobileDesk>;
  return <PasswordWorkspace $opened={opened || !!revealed} data-password-workspace data-analytics-ignore>
    <RecordHead><h1>Password requests</h1><Hint as="p">Verify the member by phone, then set a temporary password and read it to them.</Hint></RecordHead>
    {(action.notice || action.message) && <RecordFeedback><ActionNotices action={action} /></RecordFeedback>}
    <RequestList aria-label="Password requests">
      <RecordListTools><SearchField><SearchIcon /><span>Find a password request</span><input type="search" value={search} maxLength={80} disabled={action.busy} placeholder="Search by phone" autoComplete="off"
        onChange={event => { setSearch(event.target.value); setRevealed(null); }} /></SearchField></RecordListTools>
      <RecordListScroll tabIndex={0} aria-label="Pending password requests">
        {listed.length ? listed.map(request => <li key={`${request.id}:${request.requestedAt}`}><RecordItem type="button" data-password-request={request.id} aria-current={selected?.id === request.id && !revealed ? "true" : undefined}
          aria-controls="password-request-detail" disabled={action.busy} onClick={() => choose(request)}><RecordItemTitle>+{formatPhone(request.phone)}</RecordItemTitle><KeyIcon />
          <RequestMeta>Requested {formatPeriodEnd(new Date(request.requestedAt))}</RequestMeta></RecordItem></li>)
          : <li><RecordEmpty><KeyIcon /><strong>{search ? "No matching password requests." : "No pending password requests."}</strong></RecordEmpty></li>}
      </RecordListScroll>
      <RecordListFooter>{listed.length} of {pending.length} pending requests</RecordListFooter>
    </RequestList>
    <RequestDetails id="password-request-detail" aria-label="Password request details">
      <RecordCard>
        <RecordScroll>
          <RecordDetailHead>{phone ? <h2>+{formatPhone(phone)}</h2> : <h2>Password requests</h2>}
            {!desktop && <ActionButton type="button" disabled={action.busy} onClick={done}><ChevronLeftIcon />All requests</ActionButton>}</RecordDetailHead>
          <RecordBody>
            {revealed ? <TemporaryPassword key={revealed.password} value={revealed} done={done} externalActions={desktop} />
              : selected ? <div key={`${selected.id}:${selected.requestedAt}`}>
                <MetaLine>Requested {formatPeriodEnd(new Date(selected.requestedAt))}</MetaLine>
                <Links><TextAction as={Link} href={`/admin/subscribers?accountId=${selected.id}`} prefetch={false}><UserIcon />View account</TextAction>
                  <TextAction as="a" href={`tel:+${selected.phone}`}><PhoneIcon />Call member</TextAction></Links>
                <Hint as="p">Every device signs out. The temporary password works once and expires in 15 minutes.</Hint>
                <PasswordReset path={`/api/admin/subscribers/${selected.id}`} action={action} isActive={() => mounted.current} formId={`password-request-form-${selected.id}`} externalActions={desktop} reveal={value => {
                  setRevealed({ ...value, phone: selected.phone }); setHandled(current => [...current, `${selected.id}:${selected.requestedAt}`]);
                }} />
              </div> : <RecordEmpty><KeyIcon /><strong>{search ? "No matching password requests." : "No pending password requests."}</strong><p>Select a request when one becomes available.</p></RecordEmpty>}
          </RecordBody>
        </RecordScroll>
        {desktop && (revealed || selected) && <RecordFooter><span data-record-summary>{phone ? `+${formatPhone(phone)}` : "Password recovery"}</span>
          {revealed ? <ActionButton type="button" onClick={done}>Done</ActionButton>
            : <ActionButton type="submit" form={formId} $variant="primary" disabled={action.busy}><KeyIcon />Set temporary password</ActionButton>}
        </RecordFooter>}
      </RecordCard>
    </RequestDetails>
  </PasswordWorkspace>;
}

const RequestList = styled(RecordList)``;
const RequestDetails = styled(RecordDetails)``;
const PasswordWorkspace = styled(RecordWorkspace)<{ $opened: boolean }>`
  ${media.belowDesktop} { ${({ $opened }) => $opened ? css`> ${RequestList} { display: none; }` : css`> ${RequestDetails} { display: none; }`} }
`;
const RequestMeta = styled(RecordItemMeta)`grid-column: 1 / -1;`;
const MobileDesk = styled.div`display: grid; gap: 12px; min-inline-size: 0; h2 { font-size: 0.9375rem; }`;
const Links = styled.p`display: flex; flex-wrap: wrap; gap: 0 16px; margin-block: 6px;`;
const SearchField = styled.label`
  position: relative; display: flex; align-items: center; gap: 8px; min-inline-size: 0;
  > span { position: absolute; inline-size: 1px; block-size: 1px; overflow: hidden; clip-path: inset(50%); }
  > svg { position: absolute; inset-inline-start: 10px; font-size: 1rem; color: ${({ theme }) => theme.color.mutedText}; }
  input { inline-size: 100%; min-inline-size: 0; min-block-size: 40px; padding: 6px 10px 6px 34px; border: 1px solid ${({ theme }) => theme.color.controlBorder}; background: ${({ theme }) => theme.color.surface}; color: ${({ theme }) => theme.color.text}; font: inherit; }
  ${media.desktop} { input { min-block-size: 34px; font-size: 0.8125rem; } }
`;
