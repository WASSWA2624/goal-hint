import cases from '../../cases.json';
import {createMethodologyRoute} from '@/app/_components/methodology-route';
import {parseReportingDate,utcInstantFromEpochMilliseconds} from '@/domain/calendar';
import {parsePerformanceQuery} from '@/server/performance/performance-query';
import {performanceParameters} from '@/server/performance/performance-page';
import {MatchFeedError} from '@/server/matches/feed-error';
import type {PerformanceResponse} from '@/domain/performance';
export {generateMetadata} from '@/app/[locale]/how-it-works/page';
const stored=cases as unknown as Record<string,{data:PerformanceResponse}>;
const at=utcInstantFromEpochMilliseconds(stored.default!.data.asOf);
export default createMethodologyRoute(async parameters=>{
  const query=parsePerformanceQuery(parameters,parseReportingDate('2026-10-13'));
  if(query.version==='server-failure')throw new MatchFeedError('unavailable');
  for(const name of ['default','unapproved','ai']) {
    const data=stored[name]!.data;
    const expected=parsePerformanceQuery(new URLSearchParams({from:data.cohort.from,to:data.cohort.to,market:data.filters.market,source:data.filters.source}),parseReportingDate('2026-10-13'));
    if(performanceParameters(query).toString()===performanceParameters(expected).toString())return data;
  }
  throw new MatchFeedError('unavailable');
},async()=>at);
