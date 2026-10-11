import {notFound} from 'next/navigation';
import cases from '../../cases.json';
import {MethodologyPage} from '@/app/_components/methodology-page';
import {parseReportingDate} from '@/domain/calendar';
import {parsePerformanceQuery} from '@/server/performance/performance-query';
import type {PerformancePageResult} from '@/server/performance/performance-page';
const stored=cases as unknown as Record<string,PerformancePageResult>;
export default async function Page({params}:{params:Promise<{scenario:string}>}){
  const {scenario}=await params,result=stored[scenario];if(!result||scenario.startsWith('detail:'))notFound();
  const data=result.data??stored.mixed!.data!;
  const query=parsePerformanceQuery(new URLSearchParams({from:data.cohort.from,to:data.cohort.to,market:data.filters.market,source:data.filters.source}),parseReportingDate('2026-10-13'));
  return <MethodologyPage locale="en" today={parseReportingDate('2026-10-13')} result={{...result,query}}/>;
}
