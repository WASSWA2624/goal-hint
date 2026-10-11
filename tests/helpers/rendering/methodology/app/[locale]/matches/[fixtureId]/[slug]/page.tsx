import cases from '../../../../cases.json';
import {createMatchDetailRoute} from '@/app/_components/match-detail-route';
import type {MatchDetailResponse} from '@/domain/match-detail';
import {MatchFeedError} from '@/server/matches/feed-error';
const stored=cases as unknown as Record<string,MatchDetailResponse>;
const route=createMatchDetailRoute(async id=>{const data=stored['detail:'+id];if(!data)throw new MatchFeedError('not-found');return data;});
export const generateMetadata=route.generateMetadata;export default route.Page;
