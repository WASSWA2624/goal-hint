import { isSafeRemoteImageUrl } from "./remote-image.ts";

/** Only the approved provider's numeric PNG badges enter the image optimizer. */
export function isOptimizableProviderLogo(value: string): boolean {
  if (!isSafeRemoteImageUrl(value)) return false;
  const url = new URL(value);
  return url.origin === "https://media.api-sports.io" && /^\/football\/(teams|leagues)\/[1-9]\d{0,9}\.png$/u.test(url.pathname);
}
