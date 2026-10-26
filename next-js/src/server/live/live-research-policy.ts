import "server-only";

export const liveResearchRules = Object.freeze({ provider: "brave-search", contract: "brave-authoritative-articles-v1",
  endpoint: "https://api.search.brave.com/res/v1/web/search", requestUsdPicos: 5_000_000_000n,
  timeoutMs: 15_000, maxResults: 4, maxArticles: 2, maxArticleBytes: 262_144, maxSearchBytes: 131_072,
  maxExtractCharacters: 450, freshnessMs: 3 * 86_400_000, retentionMs: 30 * 86_400_000,
  documentation: "https://api-dashboard.search.brave.com/api-reference/web/search/get" });
