export {default} from '@/app/[locale]/contact/page';
import {createInformationMetadata} from '@/server/seo/metadata';
import {policy} from '../../policy';
export const generateMetadata=createInformationMetadata('contact',policy);
