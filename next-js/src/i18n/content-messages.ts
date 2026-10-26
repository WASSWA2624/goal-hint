import "server-only";

import { publicOperator } from "../domain/public-operator.ts";
import { parseReportingDate } from "../domain/calendar.ts";
import { createMessages, fillMessage, type Messages, type TextKey } from "./messages.ts";
import { contactMessages } from "./messages/contact.ts";
import { helpMessages } from "./messages/help.ts";
import { privacyMessages } from "./messages/privacy.ts";
import { termsMessages } from "./messages/terms.ts";

// Information-page prose stays out of the shared client catalog; only Server Components read it.
const content = { ...helpMessages, ...privacyMessages, ...termsMessages, ...contactMessages } as const;

export type ContentTextKey = TextKey | keyof typeof content;
export type ContentMessages = Omit<Messages, "text"> & {
  text(key: ContentTextKey, values?: Readonly<Record<string, string>>): string;
};

const byBase = new WeakMap<Messages, ContentMessages>();

/** The default English catalog plus information-page keys, shared per locale like createMessages. */
export function createContentMessages(locale?: string): ContentMessages {
  const base = createMessages(locale);
  const existing = byBase.get(base);
  if (existing) return existing;
  const defaults = {
    operator: publicOperator.name, country: publicOperator.country, audience: publicOperator.audience,
    paidAccess: publicOperator.paidAccess, minimumAge: String(publicOperator.minimumAge), requestsOwner: publicOperator.requestsOwner,
    plannedLaunchDate: base.reportingDate(parseReportingDate(publicOperator.plannedLaunchOn)),
  };
  const created: ContentMessages = Object.freeze({ ...base, text(key: ContentTextKey, values: Readonly<Record<string, string>> = {}) {
    return Object.hasOwn(content, key) ? fillMessage(content[key as keyof typeof content], { ...defaults, ...values }) : base.text(key as TextKey, values);
  } });
  byBase.set(base, created);
  return created;
}
