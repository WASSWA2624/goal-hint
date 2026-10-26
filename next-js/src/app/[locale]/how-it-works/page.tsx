import { permanentRedirect } from "next/navigation";
import { informationHref } from "@/domain/navigation";

/** Keep saved links working after the information page was renamed. */
export default async function LegacyHelpPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  permanentRedirect(informationHref("help", locale));
}
