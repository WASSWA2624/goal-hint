import RealPage from "@/app/(owner)/admin/page";
import {seed} from "../../fixture";
seed();
export const dynamic="force-dynamic";
export {metadata} from "@/app/(owner)/admin/page";
export default async function Page(props:{searchParams:Promise<Record<string,string|string[]|undefined>>}){seed();return RealPage(props);}
