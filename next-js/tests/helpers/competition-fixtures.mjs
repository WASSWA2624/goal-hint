// Explicitly synthetic competition records for native component review, never production imports.
import { competitionViewSchema } from '../../src/domain/competition-view.ts';
const clubs = [
  ['city','Manchester City','MCI'], ['ars','Arsenal','ARS'], ['liv','Liverpool','LIV'], ['chelsea','Chelsea','CHE'],
  ['newcastle','Newcastle United','NEW'], ['spurs','Tottenham Hotspur','TOT'], ['brighton','Brighton & Hove Albion','BHA'],
  ['united','Manchester United','MUN'], ['villa','Aston Villa','AVL'], ['westham','West Ham United','WHU'],
  ['bournemouth','Bournemouth','BOU'], ['fulham','Fulham','FUL'], ['palace','Crystal Palace','CRY'], ['brentford','Brentford','BRE'],
  ['forest','Nottingham Forest','NFO'], ['everton','Everton','EVE'], ['wolves','Wolverhampton Wanderers','WOL'],
  ['leicester','Leicester City','LEI'], ['ipswich','Ipswich Town','IPS'], ['southampton','Southampton','SOU'],
].map(([id,name,shortName]) => ({id,name,shortName,logoUrl:null}));
const club = id => clubs.find(team => team.id === id);

export function sampleCompetitionViews(now, form) {
  const wins = [8,7,6,6,5,5,4,4,4,3,3,3,2,2,2,2,1,1,1,0];
  const draws = [1,2,3,1,3,1,3,2,1,3,2,1,4,3,2,1,3,2,1,3];
  const rows = clubs.map((team,index) => {
    const w=wins[index],d=draws[index],l=10-w-d;
    const supplied = team.id === 'ars' ? form.home : team.id === 'liv' ? form.away : null;
    const recent = supplied ? supplied.slice(0,5).reverse().map(record => {
      const home = record.home.id === team.id, gf = home ? record.homeGoals : record.awayGoals, ga = home ? record.awayGoals : record.homeGoals;
      return {result:gf>ga?'W':gf<ga?'L':'D',opponent:(home?record.away:record.home).name,kickoffAt:record.kickoffAt,goalsFor:gf,goalsAgainst:ga};
    }) : [...Array(l).fill('L'),...Array(d).fill('D'),...Array(w).fill('W')].slice(-5).map(result=>({result}));
    return {rank:index+1,team,played:10,wins:w,draws:d,losses:l,goalsFor:24-index,goalsAgainst:8+index,
      goalDifference:16-index*2,points:3*w+d,form:recent};
  });
  const league = competitionViewSchema.parse({season:2026,defaultView:'table',bracket:null,
    tables:{complete:true,retrievedAt:now,groups:[{id:'league',name:null,rows}]}});
  const match = (home,away,h,a,days,id=null,penaltyHome=null,penaltyAway=null) => ({fixtureId:id,slug:id?'knockout':null,
    homeId:home,awayId:away,homeGoals:h,awayGoals:a,kickoffAt:now+days*86400000,status:h===null?'scheduled':penaltyHome!==null?'finished-penalties':'finished-regulation',
    penaltyHome,penaltyAway,scorePeriod:h===null?null:'final'});
  const tie = (id,home,away,fixtures,winnerId,nextTieId,aggregateHome=null,aggregateAway=null) => ({id,home:home?club(home):null,away:away?club(away):null,
    fixtures,winnerId,nextTieId,aggregateHome,aggregateAway});
  const pairs=[['ars','fulham','ars'],['liv','everton','liv'],['city','bournemouth','city'],['chelsea','palace','chelsea'],
    ['united','forest','united'],['spurs','wolves','spurs'],['newcastle','brentford','newcastle'],['brighton','westham','brighton']];
  const last16=pairs.map(([home,away,winner],index)=>tie(`r16-${index+1}`,home,away,[match(home,away,2,0,-21)],winner,`qf-${Math.floor(index/2)+1}`));
  const quarters=[
    tie('qf-1','ars','liv',[match('ars','liv',2,2,0,'10000000-0000-4000-8000-000000000007',5,4)],'ars','sf-1'),
    tie('qf-2','city','chelsea',[match('city','chelsea',3,2,-1)],'city','sf-1'),
    tie('qf-3','united','spurs',[match('united','spurs',2,1,-11),match('spurs','united',1,1,-1)],'united','sf-2',3,2),
    tie('qf-4','newcastle','brighton',[match('newcastle','brighton',1,0,-1)],'newcastle','sf-2'),
  ];
  const semis=[tie('sf-1','ars','city',[match('ars','city',null,null,10)],null,'final'),
    tie('sf-2','united','newcastle',[match('united','newcastle',null,null,10)],null,'final')];
  const bracket={complete:true,retrievedAt:now,rounds:[{id:'round-of-16',name:'Round of 16',ties:last16},
    {id:'quarter-finals',name:'Quarter-finals',ties:quarters},{id:'semi-finals',name:'Semi-finals',ties:semis},
    {id:'final',name:'Final',ties:[tie('final',null,null,[],null,null)]}]};
  const cup=competitionViewSchema.parse({season:2026,defaultView:'bracket',tables:null,bracket});
  const groupTeams=[['ars','liv','fulham','everton'],['city','chelsea','bournemouth','palace'],
    ['united','spurs','forest','wolves'],['newcastle','brighton','brentford','westham']];
  const groups=groupTeams.map((teams,index)=>({id:`group-${index+1}`,name:`Group ${String.fromCharCode(65+index)}`,
    rows:teams.map((id,rank)=>({rank:rank+1,team:club(id),played:3,wins:3-rank,draws:0,losses:rank,
      goalsFor:[6,5,3,1][rank],goalsAgainst:[2,3,4,6][rank],goalDifference:[4,2,-1,-5][rank],points:(3-rank)*3,
      form:[...Array(rank).fill('L'),...Array(3-rank).fill('W')].map(result=>({result}))}))}));
  const mixed=competitionViewSchema.parse({season:2026,defaultView:'table',tables:{complete:true,retrievedAt:now,groups},
    bracket:{...bracket,rounds:bracket.rounds.slice(1)}});
  const draw=[['ars','chelsea'],['city','liv'],['united','brighton'],['newcastle','spurs']];
  mixed.bracket.rounds.forEach((round,index)=>round.ties.forEach((node,slot)=>{
    node.winnerId=null; node.aggregateHome=null; node.aggregateAway=null;
    if (index===0) {
      const [home,away]=draw[slot]; node.home=club(home); node.away=club(away);
      node.fixtures=[match(home,away,null,null,7)];
    } else { node.home=null; node.away=null; node.fixtures=[]; }
  }));
  const partial=competitionViewSchema.parse({...cup,bracket:{...bracket,complete:false,rounds:bracket.rounds.map((round,index)=>index===0?{...round,ties:round.ties.slice(0,5)}:round)}});
  return {league,cup,mixed,partial};
}
