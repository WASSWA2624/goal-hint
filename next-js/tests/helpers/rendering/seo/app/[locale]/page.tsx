import { fullAccess } from '@/../tests/helpers/full-access';
import {createBestSlipsRoute} from '@/app/_components/best-slips-route';
import {readBestSlips} from '../stored';import {policy} from '../policy';
const route=createBestSlipsRoute({access:fullAccess,read:readBestSlips,policy});export const generateMetadata=route.generateMetadata;export default route.Page;
