import { defineConfig } from "prisma/config";

// scripts/database.mjs validates private policy and supplies the normalized URL.
// Prisma's config loader must not load web-only markers through its TS resolver.
const migrationUrl = process.env.MIGRATION_DATABASE_URL;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // Generation/validation work without any target; migration access is separate.
  ...(migrationUrl ? { datasource: { url: migrationUrl } } : {}),
});
