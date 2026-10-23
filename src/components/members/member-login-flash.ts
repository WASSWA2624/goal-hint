export type MemberLoginFlash = "signed-in" | "other-device-signed-out";

export const memberLoginFlashKey = "goal-hint-login-notice:v1";

/** The destination page receives only an event code, never account or session details. */
export function saveMemberLoginFlash(otherDeviceSignedOut: boolean, storage?: Pick<Storage, "setItem">): boolean {
  try {
    (storage ?? window.sessionStorage).setItem(memberLoginFlashKey, otherDeviceSignedOut ? "other-device-signed-out" : "signed-in");
    return true;
  } catch { return false; }
}

/** Consume once so reloading or later navigation cannot repeat a previous login result. */
export function consumeMemberLoginFlash(storage?: Pick<Storage, "getItem" | "removeItem">): MemberLoginFlash | null {
  try {
    const target = storage ?? window.sessionStorage;
    const notice = target.getItem(memberLoginFlashKey);
    target.removeItem(memberLoginFlashKey);
    return notice === "signed-in" || notice === "other-device-signed-out" ? notice : null;
  } catch { return null; }
}
