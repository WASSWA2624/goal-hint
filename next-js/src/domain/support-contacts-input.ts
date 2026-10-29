import { validMobilePhone } from "./phone-mobile.ts";
import { supportContactRules, type SupportContact } from "./support-contacts.ts";

const fields = new Set(["id", "label", "network", "phone", "calls", "whatsapp", "enabled", "primary"]);
type ParsedSupportContacts = Readonly<{ ok: true; contacts: readonly SupportContact[] }> | Readonly<{ ok: false; error: string }>;

/** Save only complete, canonical contacts; one number carries all of its available contact methods. */
export function parseSupportContacts(input: unknown): ParsedSupportContacts {
  if (!Array.isArray(input)) return { ok: false, error: "Send the support numbers as a list." };
  if (input.length > supportContactRules.max) return { ok: false, error: `Use at most ${supportContactRules.max} support numbers.` };
  const contacts: SupportContact[] = [], ids = new Set<string>(), numbers = new Set<string>();
  let primaryCount = 0;
  for (const [index, entry] of input.entries()) {
    const invalid = (reason: string): ParsedSupportContacts => ({ ok: false, error: `Support number ${index + 1}: ${reason}` });
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return invalid("enter the contact details.");
    if (Object.keys(entry).some(key => !fields.has(key))) return invalid("remove unrecognized contact details.");
    const contact = entry as Record<string, unknown>;
    if (typeof contact.id !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/u.test(contact.id)) return invalid("use a valid contact ID.");
    if (ids.has(contact.id)) return invalid("each contact must have its own ID.");
    if (typeof contact.label !== "string") return invalid("enter a label, such as MTN support.");
    const label = contact.label.trim();
    if (!label || label.length > supportContactRules.labelMaxLength || /[\u0000-\u001f\u007f]/u.test(label)) {
      return invalid(`enter a label of 1–${supportContactRules.labelMaxLength} characters.`);
    }
    if (contact.network !== "mtn" && contact.network !== "airtel" && contact.network !== "other") return invalid("choose MTN, Airtel, or Other.");
    const phone = validMobilePhone(contact.phone);
    if (!phone) return invalid("enter a valid mobile number with its country code.");
    if (numbers.has(phone)) return invalid("this phone number is already listed; combine its contact methods in one row.");
    if (["calls", "whatsapp", "enabled", "primary"].some(key => typeof contact[key] !== "boolean")) return invalid("choose the contact methods and availability.");
    if (!contact.calls && !contact.whatsapp) return invalid("enable calls, WhatsApp, or both.");
    if (contact.enabled && contact.primary && ++primaryCount > 1) return invalid("only one enabled contact can be the primary number.");
    ids.add(contact.id); numbers.add(phone);
    contacts.push(Object.freeze({ id: contact.id, label, network: contact.network, phone, calls: contact.calls as boolean,
      whatsapp: contact.whatsapp as boolean, enabled: contact.enabled as boolean, primary: contact.primary as boolean }));
  }
  return { ok: true, contacts: Object.freeze(contacts) };
}
