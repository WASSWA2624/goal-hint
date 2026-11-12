import type { ReferralInvitation } from "../../domain/referral-invitation.ts";
import { publicPolicy } from "../../domain/public-policy.ts";

export type NativeShareImage = Readonly<{ name: string; data: string }>;

declare global {
  interface Window {
    goalHintNativeShare?: Readonly<{ version: 1;
      readableReferences?: boolean;
      publicInvitations?: boolean;
      downloadFiles?: (data: ReferralInvitation & { files: readonly NativeShareImage[] }) => Promise<"handed-off" | "cancelled">;
      shareFiles?: (data: ReferralInvitation & { files: readonly NativeShareImage[] }) => Promise<"handed-off" | "cancelled">;
      share: (data: ReferralInvitation) => Promise<"handed-off" | "cancelled"> }>;
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
    const bridge = window.goalHintNativeShare, guest = data.url === publicPolicy.origin;
    if (bridge?.version === 1 && (!guest || bridge.publicInvitations)) {
      if (/\/r\/[0-9]{8}$/u.test(data.url) && !bridge.readableReferences) return "failed";
      if (data.text.length > (guest || data.url.includes("/r/") ? 512 : 4096)) return "failed";
      return await bridge.share(data);
    }
    if (!window.isSecureContext || typeof navigator.share !== "function"
      || typeof navigator.canShare === "function" && !navigator.canShare(data)) return "failed";
    await navigator.share(data);
    return "handed-off";
  } catch (error) {
    return error instanceof DOMException && error.name === "AbortError" ? "cancelled" : "failed";
  }
}
