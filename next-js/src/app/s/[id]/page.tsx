import { cache } from "react";
import { notFound } from "next/navigation";
import { PublicShell } from "@/app/_components/public-shell";
import { SlipTable } from "@/components/slips/slip-table";
import { ButtonLink } from "@/components/ui/controls";
import { Inline, PageHeading, Stack, MutedText } from "@/components/ui/layout";
import { publicPolicy } from "@/domain/public-policy";
import { sharedSlipPath } from "@/domain/shared-slips";
import { readSharedSlip } from "@/server/slips/shared-slips";
import { pageMetadata } from "@/server/seo/metadata";
import { createMessages } from "@/i18n/messages";

type Props = { params: Promise<{ id: string }> };
const read = cache(readSharedSlip);
const messages = createMessages(publicPolicy.defaultLocale);

export async function generateMetadata({ params }: Props) {
  const shared = await read((await params).id);
  return shared ? pageMetadata({ title: `${messages.text("slipShare.sharedTitle")} | ${publicPolicy.name}`,
    description: `${messages.text("slipShare.summary", { selections: messages.plural("slips.selections", shared.slip.selections.length), odds: shared.slip.totalOdds })}. ${messages.text("slipShare.createdWith", { name: publicPolicy.name })}.`,
    path: sharedSlipPath(shared.id) }) : pageMetadata({ title: `${messages.text("slipShare.notFoundTitle")} | ${publicPolicy.name}`, description: messages.text("slipShare.notFoundDescription") });
}

/** A deliberately shared snapshot is readable without an account; the sharer's identity never reaches the page. */
export default async function SharedSlipPage({ params }: Props) {
  const shared = await read((await params).id);
  if (!shared) notFound();
  return <PublicShell locale={publicPolicy.defaultLocale} current="slips" app compact>
    <Stack $gap="md">
      <Inline><PageHeading>{messages.text("slipShare.sharedTitle")}</PageHeading><MutedText>{messages.text("slipShare.createdWith", { name: publicPolicy.name })}</MutedText></Inline>
      <SlipTable slip={shared.slip} index={0} locale={publicPolicy.defaultLocale} sharedSlip={shared} initiallyOpen />
      <Inline><ButtonLink href="/en/slips" prefetch={false}>{messages.text("slipShare.buildOwn")}</ButtonLink><ButtonLink href="/en" variant="secondary" prefetch={false}>{messages.text("bestSlips.title")}</ButtonLink></Inline>
    </Stack>
  </PublicShell>;
}
