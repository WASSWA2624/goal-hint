import { createFeedRoute } from "@/app/_components/feed-route";
import { parseUtcInstant } from "@/domain/calendar";
import { fullAccess } from "@/../tests/helpers/full-access";

/** Incompatible unified-page queries must redirect before any stored-data access. */
const route = createFeedRoute({
  instant: async () => parseUtcInstant("2026-10-09T08:00:00Z"),
  resolveAccess: fullAccess,
  read: async () => { throw new Error("Status/date normalization must redirect before reading the feed."); },
});

export default async function Page({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return route.Page({ params: Promise.resolve({ locale: "en" }), searchParams });
}
