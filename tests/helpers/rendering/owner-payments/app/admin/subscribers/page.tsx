import RealPage from "@/app/admin/subscribers/page";
import {seed} from "../../fixture";
import {FixtureControls} from "../../fixture-controls";
seed();
export const dynamic="force-dynamic";
export {metadata} from "@/app/admin/subscribers/page";
export default async function Page(props:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const parameters=await props.searchParams;seed({emptySubscribers:parameters.fixture==="empty"});return <>{await RealPage(props)}<FixtureControls/></>;
}
