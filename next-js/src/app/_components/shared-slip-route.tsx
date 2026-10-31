import "server-only";
import { notFound } from "next/navigation";
import { PublicShell } from "./public-shell";
import { SlipCard } from "@/components/slips/slip-card";
import { ButtonLink } from "@/components/ui/controls";
import { DesktopContent, Inline, PageHeading, Stack, MutedText } from "@/components/ui/layout";
import { publicPolicy } from "@/domain/public-policy";
import { sharedSlipPath } from "@/domain/shared-slips";
import { readSharedSlipLanding } from "@/server/slips/shared-slips";
import { pageMetadata } from "@/server/seo/metadata";
import { createMessages } from "@/i18n/messages";

const locale = publicPolicy.defaultLocale, m = createMessages(locale);
// Previews are generic even for entitled viewers; they never read a snapshot.
export const sharedSlipMetadata = pageMetadata({ title: `${m.text("slipShare.sharedTitle")} | ${publicPolicy.name}`,
  description: m.text("slipShare.captionAccess") });

export function SharedSlipMissing() {
  return <PublicShell locale={locale} current="slips" app compact><DesktopContent><Stack $gap="md">
    <PageHeading>{m.text("slipShare.notFoundTitle")}</PageHeading><p>{m.text("slipShare.notFoundDescription")}</p>
    <ButtonLink href="/en" prefetch={false}>{m.text("bestSlips.title")}</ButtonLink>
  </Stack></DesktopContent></PublicShell>;
}

export function createSharedSlipRoute(read = readSharedSlipLanding) {
  return async function SharedSlipRoute({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    let landing;
    try { landing = await read(id); } catch { /* No private diagnostic enters the page. */ }
    if (landing?.result.state === "missing") notFound();
    const shared = landing?.result.state === "available" ? landing.result.shared : null;
    const path = landing ? sharedSlipPath(id) : null;
    return <PublicShell locale={locale} current="slips" app compact><DesktopContent><Stack $gap="md">
      <Inline><PageHeading>{m.text(shared ? "slipShare.sharedTitle" : landing ? "slipShare.accessTitle" : "slipShare.unavailableTitle")}</PageHeading>
        {shared && <MutedText>{m.text("slipShare.createdWith", { name: publicPolicy.name })}</MutedText>}</Inline>
      {shared ? <SlipCard slip={shared.slip} index={0} locale={locale} sharedSlip={shared} initiallyOpen />
        : landing ? <><p>{m.text(landing.access.signedIn ? "slipShare.accessMember" : "slipShare.accessGuest")}</p><Inline>
          {!landing.access.signedIn && <ButtonLink href={`/en/account?${new URLSearchParams({ view: "login", return: path! })}`} prefetch={false}>{m.text("slipShare.signIn")}</ButtonLink>}
          <ButtonLink variant="secondary" href={`/en/subscribe?${new URLSearchParams({ return: path! })}`} prefetch={false}>{m.text("slipShare.getAccess")}</ButtonLink>
        </Inline></> : <><p role="status">{m.text("slipShare.unavailable")}</p><ButtonLink href={`/s/${encodeURIComponent(id)}`} prefetch={false}>{m.text("slipShare.retry")}</ButtonLink></>}
      <Inline><ButtonLink href="/en/slips" variant="secondary" prefetch={false}>{m.text("slipShare.buildOwn")}</ButtonLink>
        <ButtonLink href="/en" variant="secondary" prefetch={false}>{m.text("bestSlips.title")}</ButtonLink></Inline>
    </Stack></DesktopContent></PublicShell>;
  };
}
