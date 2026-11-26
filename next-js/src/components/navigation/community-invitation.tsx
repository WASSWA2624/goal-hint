"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styled from "styled-components";
import { CriteriaDialog, CriteriaDialogButton } from "@/components/ui/criteria-dialog";
import { communityInvitationLinks } from "@/domain/community";
import { createMessages } from "@/i18n/messages";
import { CommunityDialog, useCommunitySettings } from "./community";
import { startCommunityInvitationFlow, type CommunityPrompt } from "./community-invitation-flow";
import { AppLoading } from "./navigation-progress";

const AnswerError = styled.p`
  flex-basis: 100%; margin: 0;
  color: ${({ theme }) => theme.color.outcome.incorrect.text};
  font-size: var(--gh-font-secondary); line-height: var(--gh-leading-compact);
`;

export function CommunityInvitation({ locale }: { locale: string }) {
  const settings = useCommunitySettings();
  const links = useMemo(() => communityInvitationLinks(settings.links), [settings.links]);
  const hasLinks = links.length > 0;
  const [prompt, setPrompt] = useState<CommunityPrompt | null>(null);
  const flow = useRef<ReturnType<typeof startCommunityInvitationFlow> | null>(null);
  const id = useId();

  useEffect(() => {
    const current = startCommunityInvitationFlow(setPrompt);
    flow.current = current;
    return () => { flow.current = null; current.dispose(); };
  }, []);
  useEffect(() => { flow.current?.configure(settings.visible, hasLinks); }, [settings.visible, hasLinks]);

  if (!prompt || !settings.visible) return null;
  if (prompt.kind === "invitation") return hasLinks ? createPortal(<CommunityDialog open links={links} locale={locale}
    onClose={() => flow.current?.closeInvitation()} onVisit={() => flow.current?.visitDestination()} />, document.body) : null;

  const messages = createMessages(locale), no = () => { void flow.current?.answer(false); };
  const errorId = prompt.failed ? `${id}-error` : undefined;
  return createPortal(<>
    <AppLoading active={prompt.saving === true} />
    <CriteriaDialog id={id} open busy={prompt.saving === true} closeLabel={messages.text("community.close")} hideClose
      title={messages.text("community.confirmation")} onCancel={no} dataAttributes={{ "data-community-confirmation": "" }}
      footer={<>
        {prompt.failed && <AnswerError id={errorId} role="alert">{messages.text("community.confirmFailed")}</AnswerError>}
        <CriteriaDialogButton type="button" variant="secondary" disabled={prompt.saving} onClick={no}>{messages.text("community.no")}</CriteriaDialogButton>
        <CriteriaDialogButton type="button" disabled={prompt.saving} aria-describedby={errorId}
          onClick={() => { void flow.current?.answer(true); }}>{messages.text("community.yes")}</CriteriaDialogButton>
      </>}>{null}</CriteriaDialog>
  </>, document.body);
}
