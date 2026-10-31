import { resolveLocale } from "../i18n/locales.ts";
import { memberReturnPath } from "./member-navigation.ts";

export const accountSections = ["overview", "subscription", "payments", "phone", "password", "devices", "notifications", "activity"] as const;
export type AccountSection = typeof accountSections[number];
export function accountSection(value: unknown): AccountSection {
  return accountSections.find(section => section === value) ?? "overview";
}
export function accountSectionHref(locale: string, section: AccountSection = "overview", returnTo?: string | null): string {
  const parameters = new URLSearchParams();
  if (section !== "overview") parameters.set("section", section);
  const safeReturn = memberReturnPath(returnTo);
  if (safeReturn) parameters.set("return", safeReturn);
  return `/${resolveLocale(locale)}/account${parameters.size ? `?${parameters}` : ""}`;
}
