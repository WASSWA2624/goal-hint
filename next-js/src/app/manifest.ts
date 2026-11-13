import type { MetadataRoute } from "next";
import brand from "../../assets/brand/brand-tokens.json" with { type: "json" };
import { homeHref } from "../domain/navigation-paths.ts";
import { publicPolicy } from "../domain/public-policy.ts";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: publicPolicy.name,
    short_name: publicPolicy.name,
    start_url: homeHref(),
    scope: "/",
    display: "standalone",
    lang: publicPolicy.defaultLocale,
    background_color: brand.colors.white,
    theme_color: brand.colors.navy,
    icons: [192, 512].map(size => ({ src: `/brand/goal-hint-app-icon-${size}.png`, sizes: `${size}x${size}`, type: "image/png" })),
  };
}
