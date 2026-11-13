import "server-only";

import type { ReviewedHistoryFixtureRepairRecord } from "./history-fixture-correction.ts";

const rejectedScoreReasons = ["invalid-rows", "retrieval-incomplete", "schema-error"] as const;

/** Adjudications for exact archived fixture rows. Provider responses are retained as received. */
export const reviewedHistoryFixtureRepairRecords: readonly ReviewedHistoryFixtureRepairRecord[] = [
  // Sweden · Svenska Cupen Women
  {
    receiptId: "3055b2ac-f569-85f6-9754-fc0a0c1bb437",
    pageId: "ee3c1118e2b03d61c7bd38fb76d62390b63d1a270b649de6d7c87a1f2335e6e9",
    competitionId: 737, season: 2025, expectedRows: 61, expectedVerifiedResults: 61,
    reasons: rejectedScoreReasons,
    corrections: [
      {
        fixtureId: 1446700, rawFingerprint: "44370cc604505ea8a9465c1fd23135122e356178b10803152b2bb10d5b89830d",
        patch: { score: { fulltime: { home: 1, away: 3 } } },
        expected: {
          homeTeamId: 26438, awayTeamId: 17639, kickoff: 1755709200000, providerStatus: "FT", score: { home: 1, away: 3 },
        },
        evidenceRef: "reviewed-score:api-football:1446700:https://trelleborgsff.se/nyheter/damernas-omgang-3-i-svenska-cupen-ar-lottad/|https://sportbladet-live.aftonbladet.se/fotboll/event/fc-staffanstorp-trelleborgs-ff/743019",
      },
    ],
  },
  // Serbia · Srpska Liga - Belgrade
  {
    receiptId: "b6522607-3514-8fe3-9a61-d6c4074ae5e0",
    pageId: "fed14fcdbf6aebe362dba449eebb78873610de3cf7162a6f6898f1cfa3b33701",
    competitionId: 572, season: 2025, expectedRows: 182, expectedVerifiedResults: 182,
    reasons: rejectedScoreReasons,
    corrections: [
      {
        fixtureId: 1444910, rawFingerprint: "01d2115c7cbebfdfe8f41a2751ec3443a92da5c75aa424a17a677ea5a23b7c68",
        patch: { goals: { home: 0, away: 3 }, score: { fulltime: { home: 0, away: 3 } } },
        expected: {
          homeTeamId: 12331, awayTeamId: 19842, kickoff: 1760187641000, providerStatus: "FT", score: { home: 0, away: 3 },
        },
        evidenceRef: "reviewed-score:api-football:1444910:https://www.fsb.org.rs/takmicenje/srpska-liga-beograd-2025-26/|https://www.youtube.com/watch?v=WEtZZSBCx0E",
      },
    ],
  },
  // France · National 3 - Group F
  {
    receiptId: "5b0158b2-41a6-85a1-a21e-88905398991a",
    pageId: "be833aab30941a18c1bcd5b301b5eac60a399aa49e02b38a8927e8de9caea888",
    competitionId: 466, season: 2025, expectedRows: 182, expectedVerifiedResults: 182,
    reasons: rejectedScoreReasons,
    corrections: [
      {
        fixtureId: 1426586, rawFingerprint: "06e4b3b73fc55eefe29907a9565608d8285f5612feb910fba3fcb3c09e9d2754",
        patch: { score: { fulltime: { home: 2, away: 3 } } },
        expected: {
          homeTeamId: 9313, awayTeamId: 3205, kickoff: 1759593600000, providerStatus: "FT", score: { home: 2, away: 3 },
        },
        evidenceRef: "reviewed-score:api-football:1426586:https://www.grandgenevefootball.com/fixture_and_result/thonon-evian-grand-geneve-fc-mulhouse-fc/",
      },
    ],
  },
  // France · National 3 - Group E
  {
    receiptId: "730c1c7b-4095-8b65-aa93-7104562d62d6",
    pageId: "387e8d4eeb44b6a7b7fe36ebc5a4fc15ba74617ed384c0215b5adfa85c6f6a83",
    competitionId: 465, season: 2025, expectedRows: 182, expectedVerifiedResults: 180,
    reasons: rejectedScoreReasons,
    corrections: [
      {
        fixtureId: 1427105, rawFingerprint: "6a3bb946e5b86dff78b8016b355f4c569f5b0d7da456f57e77cb8df092a2e74a",
        patch: { score: { fulltime: { home: 0, away: 2 } } },
        expected: {
          homeTeamId: 9931, awayTeamId: 22038, kickoff: 1759593600000, providerStatus: "FT", score: { home: 0, away: 2 },
        },
        evidenceRef: "reviewed-score:api-football:1427105:https://paris-idf.fff.fr/simple/championnats-nationaux-les-resultats-des-franciliens-7/",
      },
    ],
  },
  // Austria · Landesliga - Vorarlbergliga
  {
    receiptId: "7bbefd5c-72f9-8fc2-854f-243a562fb1c1",
    pageId: "031b083785bc613a21644cc15db8ee6e74bd69f280a27412c59b56b2868ba40d",
    competitionId: 231, season: 2025, expectedRows: 182, expectedVerifiedResults: 182,
    reasons: rejectedScoreReasons,
    corrections: [
      {
        fixtureId: 1465337, rawFingerprint: "6e2d49c1e90f8ede8277c98a71f8118da1d6053a0cfa48c823c537315ba7c44f",
        patch: { score: { fulltime: { home: 2, away: 2 } } },
        expected: {
          homeTeamId: 8254, awayTeamId: 8353, kickoff: 1755334800000, providerStatus: "FT", score: { home: 2, away: 2 },
        },
        evidenceRef: "reviewed-score:api-football:1465337:https://ticker.ligaportal.at/live-ticker/1171294/austria-lustenau-amateure-gegen-fc-bizau|https://esv-knittelfeld.at/component/sportsmanagement/teamplan/0/0/6368%3Av-eliteliga-vorarlberg-2025-26/4516%3Abizau/0/0.html?Itemid=2129",
      },
    ],
  },
  // Austria · Landesliga - Burgenland
  {
    receiptId: "e168cbc9-ed80-8404-90db-621ae05b6f76",
    pageId: "f5a4b78b7ea8352ee7a52c73499d14d72741405b13b78513ae54b529717fe922",
    competitionId: 224, season: 2025, expectedRows: 240, expectedVerifiedResults: 239,
    reasons: rejectedScoreReasons,
    corrections: [
      {
        fixtureId: 1463859, rawFingerprint: "63ba7389230edc71a3ffcb2a9d656f15bb4727b14cab54d09cbbbaf5977c3892",
        patch: { score: { fulltime: { home: 2, away: 0 } } },
        expected: {
          homeTeamId: 21725, awayTeamId: 19684, kickoff: 1774101600000, providerStatus: "FT", score: { home: 2, away: 0 },
        },
        evidenceRef: "reviewed-score:api-football:1463859:https://ticker.ligaportal.at/live-ticker/1145636/halbturn-gegen-ufc-jennersdorf|https://sc-esv-parndorf.at/cms/index.php/termineergebnisse/archiv/ate-202425/mstat-km-202425/results/147-burgenlandliga-2025-26/2233/0/0/0/0",
      },
    ],
  },
  // England · Non League Div One - Southern South
  {
    receiptId: "0180382d-f63f-8b8d-bfe4-bbcc33d17501",
    pageId: "e9c2e57755ea3261ba56f5b428a5930fa46e51a6ff008e9ee33892dccac86f80",
    competitionId: 56, season: 2025, expectedRows: 465, expectedVerifiedResults: 428,
    reasons: rejectedScoreReasons,
    corrections: [
      {
        fixtureId: 1444484, rawFingerprint: "5f20683121ea7849260251ab8e78346480edb9efda0c617fed7b70e9e8507774",
        patch: { score: { fulltime: { home: 3, away: 1 } } },
        expected: {
          homeTeamId: 7682, awayTeamId: 24348, kickoff: 1755957602000, providerStatus: "FT", score: { home: 3, away: 1 },
        },
        evidenceRef: "reviewed-score:api-football:1444484:https://www.winchestercityfc.co.uk/match-report/823111",
      },
    ],
  },
  // England · Non League Div One - Isthmian South Central
  {
    receiptId: "6519b93f-7218-8e4c-b498-0aefb9f45690",
    pageId: "c37f960a486b77f503c5833618a57d4577ee84dc4763bf16693459dd23fba9b4",
    competitionId: 53, season: 2025, expectedRows: 466, expectedVerifiedResults: 433,
    reasons: rejectedScoreReasons,
    corrections: [
      {
        fixtureId: 1442668, rawFingerprint: "9200fb27f52e4b3ae3141a2a79887756b2f8cd5393a12b07472dc79f60fb8e4f",
        patch: { score: { fulltime: { home: 6, away: 1 } } },
        expected: {
          homeTeamId: 7720, awayTeamId: 8707, kickoff: 1760191200000, providerStatus: "FT", score: { home: 6, away: 1 },
        },
        evidenceRef: "reviewed-score:api-football:1442668:https://binfieldfc.com/event/hayes-yeading-united-fc-vs-binfield-2/",
      },
      {
        fixtureId: 1442694, rawFingerprint: "5a12c094990a62a16e2e607eb72dd3c810e9126ceba80bc2d62e5ec35a857077",
        patch: { score: { fulltime: { home: 2, away: 1 } } },
        expected: {
          homeTeamId: 4696, awayTeamId: 8811, kickoff: 1760796000000, providerStatus: "FT", score: { home: 2, away: 1 },
        },
        evidenceRef: "reviewed-score:api-football:1442694:https://leatherheadfc.com/matches/men/leatherhead-v-hanworth-villa/",
      },
    ],
  },
  // Norway · 1. Division Women
  {
    receiptId: "e6da10f7-cc27-892d-a08d-18e088392cdb",
    pageId: "110a6bca466504de8b25cbff7b6d133cc4e736a98bba550357947a33d950ca87",
    competitionId: 915, season: 2025, expectedRows: 134, expectedVerifiedResults: 134,
    reasons: rejectedScoreReasons,
    corrections: [
      {
        fixtureId: 1356289, rawFingerprint: "326520479070288d7888d4e104345aa776fd5d07aa8821f2998e4f5bbd11d9d3",
        patch: { score: { fulltime: { home: 2, away: 2 } } },
        expected: {
          homeTeamId: 18992, awayTeamId: 25760, kickoff: 1749297600000, providerStatus: "FT", score: { home: 2, away: 2 },
        },
        evidenceRef: "reviewed-score:api-football:1356289:https://www.fotball.no/fotballdata/kamp/?fiksId=8718641",
      },
      {
        fixtureId: 1356295, rawFingerprint: "45601ca098703fd3590f30b038cad35e4968fac86269fac70cefe332bc05dc5e",
        patch: { score: { fulltime: { home: 4, away: 1 } } },
        expected: {
          homeTeamId: 22859, awayTeamId: 18987, kickoff: 1749985200000, providerStatus: "FT", score: { home: 4, away: 1 },
        },
        evidenceRef: "reviewed-score:api-football:1356295:https://www.fotball.no/fotballdata/kamp/?fiksId=8718645",
      },
      {
        fixtureId: 1356305, rawFingerprint: "415458a787b829faedd0b75635f029f66343228c60fa94b80afb9da920b53248",
        patch: { score: { fulltime: { home: 4, away: 2 } } },
        expected: {
          homeTeamId: 25761, awayTeamId: 18989, kickoff: 1754127000000, providerStatus: "FT", score: { home: 4, away: 2 },
        },
        evidenceRef: "reviewed-score:api-football:1356305:https://www.fotball.no/fotballdata/kamp/?fiksId=8718657",
      },
      {
        fixtureId: 1356317, rawFingerprint: "7a3dc425ee572a7f34af9884f63bdd6fc26d1f826bcbe0e2d45b775c1cd64b35",
        patch: { score: { fulltime: { home: 2, away: 1 } } },
        expected: {
          homeTeamId: 25760, awayTeamId: 22860, kickoff: 1755349200000, providerStatus: "FT", score: { home: 2, away: 1 },
        },
        evidenceRef: "reviewed-score:api-football:1356317:https://www.fotball.no/fotballdata/kamp/?fiksId=8718668",
      },
    ],
  },
  // Sweden · Elitettan
  {
    receiptId: "a824f1ad-20a8-839f-afa3-c06643411288",
    pageId: "f1a55a3309f5b853d6cff122f567b3191e978477332b92ed52cad1d2dc450d06",
    competitionId: 736, season: 2025, expectedRows: 183, expectedVerifiedResults: 182,
    reasons: rejectedScoreReasons,
    corrections: [],
    duplicates: [{
      fixtureId: 1377682, rawFingerprint: "cfd0e76dce9144b0086d877d30a6101a784ea8d86fb41b863abe4cac9c38a13c",
      canonicalFixtureId: 1329897, canonicalRawFingerprint: "6d8d8df3bfb076f5a08260be220d3b8ac0e946efe7d76c96695db5b6e044fa31",
      expected: {
        homeTeamId: 11082, awayTeamId: 16028, kickoff: 1749384000000, providerStatus: "FT", score: { home: 3, away: 1 },
      },
      evidenceRef: "reviewed-duplicate:api-football:1377682:1329897:https://oskfotboll.se/nyheter/2025/2025-06-08-forlust-pa-studenternas|https://eyravallen.se/2025/06/09/omgang-8-ik-uppsala-orebro-sk-3-1-1-1/",
    }],
  },
  // Cameroon · Elite One
  {
    receiptId: "de66e8e9-0573-82b5-8dff-42cf861e8cbd",
    pageId: "5d7c244a41edb9e6ed9148665ee6e112dc5f8cecce155787197d37699d44121b",
    competitionId: 411, season: 2025, expectedRows: 253, expectedVerifiedResults: 237,
    reasons: rejectedScoreReasons,
    corrections: [
      {
        fixtureId: 1317712, rawFingerprint: "dbfdee88317db0f74c3e6566598b6814434204459f8269d869eaba9fa938ccd5",
        patch: { score: { fulltime: { home: 4, away: 1 } } },
        expected: {
          homeTeamId: 5560, awayTeamId: 5407, kickoff: 1750689000000, providerStatus: "FT", score: { home: 4, away: 1 },
        },
        evidenceRef: "reviewed-score:api-football:1317712:https://www.cameroon-tribune.cm/article.html/71242/fr.html/coupe-du-cameroun-de-football-la-vitesse-superieure|https://archives.yusiip.cm/actualite_presentation.php?actualite=1669",
      },
    ],
  },
  // World · All-Island Cup - Women
  {
    receiptId: "c33b6b7d-3c0c-82a4-9f0b-c44093febe57",
    pageId: "e57e5357e0c33f61c73ef887e8e7b16b4b954715753e64e2b2f2510424dae610",
    competitionId: 1013, season: 2026, expectedRows: 31, expectedVerifiedResults: 31,
    reasons: rejectedScoreReasons,
    corrections: [
      {
        fixtureId: 1542074, rawFingerprint: "c8a51d3c465263b41bd44a0b9d926855e54dba94f951a9d596055141706c4170",
        patch: { score: { fulltime: { home: 1, away: 5 } } },
        expected: {
          homeTeamId: 21492, awayTeamId: 10907, kickoff: 1780149600000, providerStatus: "FT", score: { home: 1, away: 5 },
        },
        evidenceRef: "reviewed-score:api-football:1542074:https://www.nifootballleague.com/news/2026/may/linfield-and-cliftonville-reach-all-island-cup-quarter-finals/",
      },
    ],
  },
  // Italy · Serie D - Girone G
  {
    receiptId: "04a4311b-c0e7-8426-9ee6-a8158af1afe6",
    pageId: "005812c7ec88d8ffc88aea1d8098c124f2ea329d556502ea7d6b5128772e1bda",
    competitionId: 432, season: 2026, expectedRows: 306, expectedVerifiedResults: 99,
    reasons: rejectedScoreReasons,
    corrections: [
      {
        fixtureId: 1626563, rawFingerprint: "d609c69ae368159c033fa60bb8ceea594371b271d292f6e4ab0e65f5354d35cc",
        patch: { goals: { home: 2, away: 1 } },
        expected: {
          homeTeamId: 874, awayTeamId: 22300, kickoff: 1794403800000, providerStatus: "FT", score: { home: 2, away: 1 },
        },
        evidenceRef: "reviewed-score:api-football:1626563:https://www.seried24.com/girone-g/trastevere-rimonta-punti-anzio-battuto-doppietta-crescenzo-351207|https://laziotv.it/anzio/trastevere-anzio-2-1-i-romani-rimontano-nel-recupero/",
        existingEvidenceRef: "owner-2026-10-10-freshness#results",
      },
    ],
  },
];
