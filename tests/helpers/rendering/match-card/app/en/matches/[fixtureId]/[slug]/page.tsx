import { notFound } from "next/navigation";
import { ButtonLink } from "@/components/ui/controls";
import { Container, BodyText, PageHeading, PageMain, Stack } from "@/components/ui/layout";
import examples from "../../../../examples.json";
export default async function Page({ params }: { params: Promise<{ fixtureId: string; slug: string }> }) {
  const { fixtureId, slug } = await params;
  if (slug !== "example-home-v-example-away" || !examples.some((entry) => entry.fixture.fixtureId === fixtureId)) notFound();
  return <PageMain><Container><Stack><PageHeading>Example analysis destination</PageHeading>
    <BodyText id="example-fixture-id">{fixtureId}</BodyText>
    <BodyText>This is an isolated keyboard-navigation fixture, not real match analysis.</BodyText>
    <ButtonLink href="/" prefetch={false}>Return to examples</ButtonLink>
  </Stack></Container></PageMain>;
}
