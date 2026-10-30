"use client";

import styled from "styled-components";
import { ButtonLink, TextLink } from "@/components/ui/controls";
import { Inline, Stack } from "@/components/ui/layout";
import { subscriberHref } from "@/domain/subscriber-navigation";
import { createMessages } from "@/i18n/messages";
import { media } from "@/styles/theme";
import { CriteriaPanel } from "./slip-styles";

const AccessPanel = styled(CriteriaPanel)`
  ${media.desktop} {
    && { padding: 6px 8px; }
    > ${Stack} { gap: 4px; }
  }
`;

/** One access message per list, including when a future publication has not been released yet. */
export function BestSlipsAccess({ signedIn, locale }: { signedIn: boolean; locale: string }) {
  const m = createMessages(locale);
  return <AccessPanel role="status" data-best-slips-access><Stack $gap="sm">
    <h2>{m.text("bestSlips.access.title")}</h2>
    <p>{m.text(signedIn ? "bestSlips.access.subscribe" : "bestSlips.access.register")}</p>
    <Inline>
      <ButtonLink href={subscriberHref(signedIn)} prefetch={false}>{m.text(signedIn ? "subscribe.title" : "auth.signUp")}</ButtonLink>
      {!signedIn && <TextLink href={subscriberHref(false, "/en", "login")} prefetch={false}>{m.text("auth.signIn")}</TextLink>}
    </Inline>
  </Stack></AccessPanel>;
}
