import type { ReferralInvitation } from "../../domain/referral-invitation.ts";

export type NativeShareImage = Readonly<{ name: string; data: string }>;

declare global {
  interface Window {
    goalHintNativeShare?: Readonly<{ version: 1; shareFiles?: (data: ReferralInvitation & { files: readonly NativeShareImage[] }) => Promise<"handed-off" | "cancelled">; share: (data: ReferralInvitation) => Promise<"handed-off" | "cancelled"> }>;
  }
}

export function subscribeInvitationShare(listener: () => void) {
  window.addEventListener("goalhint:native-share-ready", listener);
  window.addEventListener("pageshow", listener);
  return () => {
    window.removeEventListener("goalhint:native-share-ready", listener);
    window.removeEventListener("pageshow", listener);
  };
}

export const serverInvitationShareAvailable = () => false;
export function invitationShareAvailable(): boolean {
  if (typeof window === "undefined") return false;
  return window.goalHintNativeShare?.version === 1 || window.isSecureContext && typeof navigator.share === "function";
}

/** Called directly by a click; no network or clipboard work consumes its activation. */
export async function shareInvitation(data: ReferralInvitation): Promise<"handed-off" | "cancelled" | "failed"> {
  try {
    if (window.goalHintNativeShare?.version === 1) {
      if (data.text.length > (data.url.includes("/r/") ? 512 : 4096)) return "failed";
      return await window.goalHintNativeShare.share(data);
    }
    if (!invitationShareAvailable() || typeof navigator.canShare === "function" && !navigator.canShare(data)) return "failed";
    await navigator.share(data);
    return "handed-off";
  } catch (error) {
    return error instanceof DOMException && error.name === "AbortError" ? "cancelled" : "failed";
  }
}
