import { z } from "zod";
import { appPlatforms, appVersionPattern } from "./app-download-presentation.ts";
export * from "./app-download-presentation.ts";

export const appVersionSchema = z.string().regex(appVersionPattern);
export const appReleaseSchema = z.object({
  platform: z.enum(appPlatforms), version: appVersionSchema, build: z.number().int().positive(),
  fileName: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]+\.(apk|exe)$/),
  size: z.number().int().positive(), sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
export const appReleaseCatalogSchema = z.object({
  schema: z.literal(1), channel: z.enum(["development", "production"]), releases: z.array(appReleaseSchema).max(2),
}).refine(value => new Set(value.releases.map(release => release.platform)).size === value.releases.length);
export type AppFileRelease = z.infer<typeof appReleaseSchema>;
