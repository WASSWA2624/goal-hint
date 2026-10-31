import { publicPolicy } from "./public-policy.ts";
import type { SharedSlip } from "./shared-slips.ts";
import { createMessages } from "../i18n/messages.ts";
export { whatsAppShareUrl } from "./share-links.ts";

/** Both destinations stay in the caption even when a share target ignores its URL field. */
export function slipShareCaption(shared: SharedSlip, locale: string): string {
  const m = createMessages(locale);
  return [m.text("slipShare.captionTitle", { name: publicPolicy.name }),
    m.text("slipShare.summary", { selections: m.plural("slips.selections", shared.slip.selections.length), odds: shared.slip.totalOdds }), "",
    m.text("slipShare.viewSlip", { url: shared.url }),
    m.text("slipShare.appLink", { name: publicPolicy.name, url: publicPolicy.origin }), "",
    m.text("slipShare.captionAccess"), "",
    m.text("slipShare.createdWith", { name: publicPolicy.name })].join("\n");
}
