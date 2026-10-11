export {default} from '@/app/[locale]/privacy/page';
import {createInformationMetadata} from '@/server/seo/metadata';
import {policy} from '../../policy';
export const generateMetadata=createInformationMetadata('privacy',policy);
