import { ContactContent } from "@/app/_components/contact-content";
import { InformationShell } from "@/app/_components/information-shell";
import { publicFixture } from "../../fixture";

export const dynamic = "force-dynamic";
export default function Page() {
  return <InformationShell locale="en" page="contact"><ContactContent locale="en" contact={publicFixture()} /></InformationShell>;
}
