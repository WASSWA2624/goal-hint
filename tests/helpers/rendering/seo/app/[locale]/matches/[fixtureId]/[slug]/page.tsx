import { fullAccess } from '@/../tests/helpers/full-access';
import {createMatchDetailRoute} from '@/app/_components/match-detail-route';
import {readDetail} from '../../../../stored';import {policy} from '../../../../policy';
// A synchronous optional-reader failure must not hide a successfully stored fixture.
const route=createMatchDetailRoute(readDetail,policy,()=>{throw new Error('Isolated optional insights unavailable.');}, fullAccess);
export const generateMetadata=route.generateMetadata;export default route.Page;
