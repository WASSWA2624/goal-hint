import {discovery} from '../stored';export const dynamic='force-dynamic';
export async function GET(){return new Response(await discovery.sitemapIndex(),{headers:{'Content-Type':'application/xml; charset=utf-8'}});}
