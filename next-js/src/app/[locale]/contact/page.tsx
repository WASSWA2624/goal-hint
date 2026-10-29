import { ContactContent } from "@/app/_components/contact-content";
import { InformationShell } from "@/app/_components/information-shell";
import { createInformationMetadata } from "@/server/seo/metadata";
import { getAnalyticsServices } from "@/server/analytics/analytics-http";
import { settingsServiceFor } from "@/server/members/settings";
import { publicSupportContactSettings } from "@/domain/public-subscription-settings";

export const generateMetadata = createInformationMetadata("contact");

export default async function ContactPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  // A missing settings store must not hide the existing public email and correction guidance.
  const contact = await getAnalyticsServices().then(async ({ database }) => {
    const settings = database ? (await settingsServiceFor(database).current()).settings : null;
    return settings ? publicSupportContactSettings(settings) : null;
  }).catch(() => null);
  return <InformationShell locale={locale} page="contact"><ContactContent locale={locale} contact={contact} /></InformationShell>;
}
