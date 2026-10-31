import type { ReferralInvitation } from "../../../domain/referral-invitation.ts";
import type { NativeShareImage } from "../../members/invitation-share.ts";

export const nativeSlipImageRules = Object.freeze({ maximumFiles: 32, maximumFileBytes: 4 * 1024 * 1024, maximumTotalBytes: 12 * 1024 * 1024 });

/** Encoding happens during preparation, before the Share click needs user activation. */
export async function prepareNativeSlipImages(files: readonly File[]): Promise<readonly NativeShareImage[] | null> {
  if (!files.length || files.length > nativeSlipImageRules.maximumFiles || files.some(file => file.type !== "image/png" || file.size > nativeSlipImageRules.maximumFileBytes)
    || files.reduce((sum, file) => sum + file.size, 0) > nativeSlipImageRules.maximumTotalBytes) return null;
  const result: NativeShareImage[] = [];
  for (const file of files) {
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",", 2)[1]!);
      reader.onerror = () => reject(new Error("Image preparation failed.")); reader.readAsDataURL(file);
    });
    result.push({ name: file.name, data });
  }
  return result;
}

export async function shareSlipImages(link: ReferralInvitation, files: File[], nativeFiles: readonly NativeShareImage[] | null): Promise<"handed-off" | "cancelled" | "failed" | "unsupported"> {
  try {
    if (window.goalHintNativeShare?.shareFiles && nativeFiles) {
      if (link.text.length > 4096) return "unsupported";
      return await window.goalHintNativeShare.shareFiles({ ...link, files: nativeFiles });
    }
    const data: ShareData = { title: link.title, text: link.text, files };
    if (typeof navigator.share !== "function" || typeof navigator.canShare !== "function" || !navigator.canShare(data)) return "unsupported";
    await navigator.share(data); return "handed-off";
  } catch (error) { return error instanceof DOMException && error.name === "AbortError" ? "cancelled" : "failed"; }
}
