import type { Metadata } from "next";
import { createMethodologyRoute } from "@/app/_components/methodology-route";
import { createMessages } from "@/i18n/messages";
import { publicPolicy } from "@/domain/public-policy";

const messages = createMessages("en");
export const metadata: Metadata = { title: messages.text("methodology.metadataTitle"), description: messages.text("methodology.description"),
  alternates: { canonical: new URL("/en/how-it-works", publicPolicy.origin).href } };

export default createMethodologyRoute();
