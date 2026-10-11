import {InformationShell} from '@/app/_components/information-shell';
import {createInformationMetadata} from '@/server/seo/metadata';
import {policy} from '../../policy';
export const generateMetadata=createInformationMetadata('how-it-works',policy);
export default function Page(){return <InformationShell locale="en" page="how-it-works"/>;}
