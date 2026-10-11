import {createMatchDetailRoute} from '@/app/_components/match-detail-route';
import {readDetail} from '../../../../stored';import {policy} from '../../../../policy';
const route=createMatchDetailRoute(readDetail,policy);export const generateMetadata=route.generateMetadata;export default route.Page;
