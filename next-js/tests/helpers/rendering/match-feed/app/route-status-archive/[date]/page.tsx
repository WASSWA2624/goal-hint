import { createFeedRoute } from "@/app/_components/feed-route";
import { parseUtcInstant } from "@/domain/calendar";
import { fullAccess } from "@/../tests/helpers/full-access";

/** Legacy dated links use the same page normalization before any stored read. */
const route = createFeedRoute({ dated: true,
  instant: async () => parseUtcInstant("2026-10-09T08:00:00Z"), resolveAccess: fullAccess,
  read: async () => { throw new Error("Archive filter transitions must redirect before reading."); },
});

export default async function Page({ params, searchParams }: {
  params: Promise<{ date: string }>; searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return route.Page({ params: params.then(({ date }) => ({ locale: "en", date })), searchParams });
}
