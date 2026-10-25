"use client";

import { useState } from "react";
import styled from "styled-components";
import { formatPhone } from "@/domain/phone";
import { formatPeriodEnd } from "@/domain/subscription-period";
import { KeyIcon, PhoneIcon, UserIcon } from "@/components/ui/icons";
import { media } from "@/styles/theme";
import { ActionNotices, useCodeAction } from "./code-tools";
import { DeskColumn, DeskGrid, EmptyPanel, MetaLine, Panel, TextAction } from "./desk-styles";
import { PasswordReset, TemporaryPassword, type Revealed } from "./subscriber-credentials";

/**
 * One panel per open request; the password just set sits beside them on desktop and above them on phones, and the
 * requests take the full width while none is showing.
 */
export function PasswordResetRequests({ requests }: { requests: readonly Readonly<{ id: string; phone: string; requestedAt: string }>[] }) {
  const action = useCodeAction(), [revealed, setRevealed] = useState<Revealed | null>(null), [handled, setHandled] = useState<string[]>([]);
  const pending = requests.filter(request => !handled.includes(`${request.id}:${request.requestedAt}`));
  return <Desk data-analytics-ignore><ActionNotices action={action} />
    <Layout $asideFirst $single={!revealed}>
      <DeskColumn>
        {pending.map(request => <RequestPanel key={request.id} aria-labelledby={`password-request-${request.id}`}><Request>
          <div>
            <h2 id={`password-request-${request.id}`}>+{formatPhone(request.phone)}</h2>
            <MetaLine>Requested {formatPeriodEnd(new Date(request.requestedAt))}</MetaLine>
          </div>
          <Links>
            <TextAction as="a" href={`/admin/subscribers?accountId=${request.id}`}><UserIcon />View account</TextAction>
            <TextAction as="a" href={`tel:+${request.phone}`}><PhoneIcon />Call member</TextAction>
          </Links>
          <Confirm><PasswordReset path={`/api/admin/subscribers/${request.id}`} action={action} reveal={value => {
            setRevealed({ ...value, phone: request.phone }); setHandled(current => [...current, `${request.id}:${request.requestedAt}`]); }} /></Confirm>
        </Request></RequestPanel>)}
        {!pending.length && <Panel><EmptyPanel><KeyIcon /><strong>No pending password requests.</strong></EmptyPanel></Panel>}
      </DeskColumn>
      {revealed && <TemporaryPassword key={revealed.password} value={revealed} done={() => setRevealed(null)} />}
    </Layout>
  </Desk>;
}

const Desk = styled.div`display: grid; gap: 12px; min-inline-size: 0;`;
const Layout = styled(DeskGrid)<{ $single: boolean }>`
  ${({ $single }) => $single && `${media.desktop} { grid-template-columns: minmax(0, 1fr); }`}
`;
/** Links sit beside the phone number only when the panel is wide; beside a password at 1024px it stacks like a phone. */
const RequestPanel = styled(Panel)`container-type: inline-size;`;
const Request = styled.div`
  display: grid;
  gap: 2px;
  min-inline-size: 0;
  padding: 12px 14px;
  h2 { font-size: 0.9375rem; line-height: 1.35; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
  ${media.desktop} { padding: 14px 16px; }
  @container (min-width: 34rem) { grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 4px 16px; }
`;
const Links = styled.p`
  display: flex;
  flex-wrap: wrap;
  gap: 0 16px;
  @container (min-width: 34rem) { justify-content: flex-end; }
`;
const Confirm = styled.div`
  min-inline-size: 0;
  @container (min-width: 34rem) { grid-column: 1 / -1; }
`;
