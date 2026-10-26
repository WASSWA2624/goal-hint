import { isOptimizableProviderLogo } from "../../domain/provider-logo.ts";

/** Retina-sized first-party badges; other approved hosts stay direct. */
export function providerImageSource(source: string, size: number): string {
  if (!isOptimizableProviderLogo(source)) return source;
  const [, kind, id] = new URL(source).pathname.match(/\/football\/(teams|leagues)\/(\d+)\.png$/u)!;
  const width = [32, 48, 64, 96, 128].find(value => value >= size * 2) ?? 128;
  return `/badges/${kind}/${id}/${width}.webp`;
}
