import { HelpContent } from '@/app/_components/help-content';
import { InformationShell } from '@/app/_components/information-shell';
import { createInformationMetadata } from '@/server/seo/metadata';
import { policy } from '../../policy';

export const generateMetadata = createInformationMetadata('help', policy);
export default function Page() { return <InformationShell locale="en" page="help"><HelpContent locale="en" /></InformationShell>; }
