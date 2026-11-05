import { ContactContent } from "@/app/_components/contact-content";
import { InformationShell } from "@/app/_components/information-shell";
import { createInformationMetadata } from "@/server/seo/metadata";
import { getAnalyticsServices } from "@/server/analytics/analytics-http";
import { settingsServiceFor } from "@/server/members/settings";
import { publicContactPageSettings } from "@/domain/contact-page";

export const generateMetadata = createInformationMetadata("contact");
export const dynamic = "force-dynamic";

export default async function ContactPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  // Use the same fresh public projection as polling, including page-specific visibility.
  const contact = await getAnalyticsServices().then(async ({ database }) => {
    const state = database ? await settingsServiceFor(database).currentFresh() : null;
    return state?.settings && state.source !== "last-good" ? publicContactPageSettings(state.settings) : null;
  }).catch(() => null);
  return <InformationShell locale={locale} page="contact"><ContactContent locale={locale} contact={contact} /></InformationShell>;
}
