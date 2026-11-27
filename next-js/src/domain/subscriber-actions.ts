export const subscriberIndividualActions = ["grant", "number", "block", "devices", "password-reset", "note", "erase", "delete"] as const;

export type SubscriberIndividualAction = (typeof subscriberIndividualActions)[number];

export function parseSubscriberIndividualAction(value: unknown): SubscriberIndividualAction | null {
  return subscriberIndividualActions.find(action => action === value) ?? null;
}

export function subscriberActionLabel(action: SubscriberIndividualAction, blocked = false): string {
  return {
    grant: "Grant access",
    number: "Change number",
    block: blocked ? "Unblock account" : "Block account",
    devices: "Log out devices",
    "password-reset": "Reset password",
    note: "Edit admin note",
    erase: "Erase personal data",
    delete: "Permanently delete account",
  }[action];
}
