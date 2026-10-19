import { createMatchDetailRoute } from "@/app/_components/match-detail-route";
import { policy, readDetail, readInsights, resolveAccess } from "../../../../stored";
export const dynamic = "force-dynamic";
const route = createMatchDetailRoute(readDetail, policy, readInsights, resolveAccess);
const normalize = (props: { params: Promise<{ fixtureId: string; slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) =>
  ({ ...props, params: props.params.then(params => ({ ...params, locale: "en" })) });
export const generateMetadata = (props: Parameters<typeof normalize>[0]) => route.generateMetadata(normalize(props));
export default function Page(props: Parameters<typeof normalize>[0]) { return route.Page(normalize(props)); }
