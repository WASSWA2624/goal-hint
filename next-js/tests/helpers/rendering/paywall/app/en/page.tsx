import { createBestSlipsRoute } from "@/app/_components/best-slips-route";
import { policy, resolveAccess } from "../stored";
import { readBest } from "../best";
export const dynamic = "force-dynamic";
const route = createBestSlipsRoute({ read: readBest, access: resolveAccess, policy });
type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const parameters = (props: Props) => ({ ...props, params: Promise.resolve({ locale: "en" }) });
export const generateMetadata = (props: Props) => route.generateMetadata(parameters(props));
export default function Page(props: Props) { return route.Page(parameters(props)); }
