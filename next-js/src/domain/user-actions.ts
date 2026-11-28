import { authCopy } from "../i18n/messages/auth.ts";

export const userIndividualActions = ["grant", "number", "block", "devices", "password-reset", "note", "erase", "delete"] as const;

export type UserIndividualAction = (typeof userIndividualActions)[number];

export function parseUserIndividualAction(value: unknown): UserIndividualAction | null {
  return userIndividualActions.find(action => action === value) ?? null;
}

export function userActionLabel(action: UserIndividualAction, blocked = false): string {
  return {
    grant: "Grant access",
    number: "Change number",
    block: blocked ? "Unblock account" : "Block account",
    devices: authCopy.logoutDevices,
    "password-reset": "Reset password",
    note: "Edit admin note",
    erase: "Erase personal data",
    delete: "Permanently delete account",
  }[action];
}
