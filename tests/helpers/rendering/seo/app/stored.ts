import {notFound} from 'next/navigation';
import {parseFeedQuery,feedQueryKey} from '@/domain/feed-query';
import {getReportingDate,utcInstantFromEpochMilliseconds} from '@/domain/calendar';
import {parseMatchDetailQuery} from '@/server/matches/detail-query';
import {MatchFeedError} from '@/server/matches/feed-error';
import {createDiscoveryRoutes} from '@/server/seo/discovery-routes';
import type {StoredMatchFeedResponse} from '@/domain/match-feed';
import type {StoredMatchDetailResponse} from '@/domain/match-detail';
import type {FeedQuery,FeedParameters} from '@/domain/feed-query';
import data from '../scenarios.json';
import {policy} from './policy';
export const instant=async()=>utcInstantFromEpochMilliseconds(data.at);
const today=getReportingDate(utcInstantFromEpochMilliseconds(data.at));
const feeds=Object.values(data.feeds) as unknown as {query:FeedQuery;result:{data:StoredMatchFeedResponse}}[];
const details=data.details as unknown as Record<string,{current:{data:StoredMatchDetailResponse};revision?:{data:StoredMatchDetailResponse}}>;
export const readFeed=async(parameters:FeedParameters)=>{
 const query=parseFeedQuery(parameters,{today});
 const selected=feeds.find(item=>item.query.page===query.page&&feedQueryKey(item.query,today)===feedQueryKey(query,today));
 if(!selected)throw new MatchFeedError('unavailable');return selected.result.data;
};
export const readDetail=async(id:string,parameters=new URLSearchParams())=>{
 const query=parseMatchDetailQuery(id,parameters),item=details[id];if(!item)throw new MatchFeedError('not-found');
 if(query.revision){if(item.revision?.data.snapshot?.revisionId!==query.revision)throw new MatchFeedError('not-found');return item.revision.data;}
 return item.current.data;
};
const reader={inventory:async()=>data.inventory,matches:async(page:number)=>page===0?data.matches.map(row=>({...row,lastModified:new Date(row.lastModified)})):[],dates:async(page:number)=>page===0?data.dates:[]};
export const discovery=createDiscoveryRoutes({policy,reader:()=>reader,missing:notFound});
