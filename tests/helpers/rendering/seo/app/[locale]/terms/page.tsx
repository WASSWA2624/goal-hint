export {default} from '@/app/[locale]/terms/page';
import {createInformationMetadata} from '@/server/seo/metadata';
import {policy} from '../../policy';
export const generateMetadata=createInformationMetadata('terms',policy);
