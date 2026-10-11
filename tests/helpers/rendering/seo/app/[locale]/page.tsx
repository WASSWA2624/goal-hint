import {createFeedRoute} from '@/app/_components/feed-route';
import {readFeed,instant} from '../stored';import {policy} from '../policy';
const route=createFeedRoute({read:readFeed,instant,policy});export const generateMetadata=route.generateMetadata;export default route.Page;
