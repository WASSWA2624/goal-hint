import { isOptimizableProviderLogo } from "../../domain/provider-logo.ts";
import { isLocalCountryFlagAsset } from "../../domain/country-flag.ts";
import { isSafeRemoteImageUrl } from "../../domain/remote-image.ts";

/** First-party retina crests and bundled flags; other approved images stay direct. */
export function providerImageSource(source: string, size: number): string {
  if (isSafeRemoteImageUrl(source)) {
    const url = new URL(source);
    const code = url.origin === "https://media.api-sports.io" ? url.pathname.match(/^\/flags\/([a-z]{2}(?:-[a-z]{3})?)\.svg$/u)?.[1]
      : url.origin === "https://flagcdn.com" ? url.pathname.match(/^\/(?:w80\/)?([a-z]{2}(?:-[a-z]{3})?)\.(?:png|svg)$/u)?.[1] : undefined;
    const flag = code ? `/flags/${code}.svg` : null;
    if (flag && isLocalCountryFlagAsset(flag)) return flag;
  }
  if (!isOptimizableProviderLogo(source)) return source;
  const [, kind, id] = new URL(source).pathname.match(/\/football\/(teams|leagues)\/(\d+)\.png$/u)!;
  const width = [32, 48, 64, 96, 128].find(value => value >= size * 2) ?? 128;
  return `/badges/${kind}/${id}/${width}.webp`;
}
