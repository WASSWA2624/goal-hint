import { localUgandaPhone } from "./phone.ts";
import type { CopyFormat } from "./subscription-settings.ts";

/** Desktop follows the configured copy format; phone payment flows retain their existing local copy behavior. */
export function copiedPaymentPhone(phone: string, format: CopyFormat, desktop: boolean): string {
  return desktop && format === "international" ? phone : localUgandaPhone(phone);
}
