import assert from "node:assert/strict";
import test from "node:test";
import { registerServerRouteTestLoader } from "./helpers/server-route-loader.mjs";
import config from "../next.config.ts";

registerServerRouteTestLoader({ source: new URL("../src/", import.meta.url).href, modules: {} });
const { default: RootPage } = await import("../src/app/page.tsx");
const { default: HomePage } = await import("../src/app/[locale]/page.tsx");

test("framework root redirects reach Matches directly on both canonical and www hosts", async () => {
  const redirects = (await config.redirects()).filter(rule => rule.source === "/");
  assert.deepEqual(redirects.map(rule => ({ host: rule.has?.[0].value ?? null, destination: rule.destination, permanent: rule.permanent })), [
    { host: "www.goalhint.com", destination: "https://goalhint.com/en/matches", permanent: true },
    { host: null, destination: "/en/matches", permanent: true },
  ]);
});

test("root and locale home routes open Matches without reading account or subscription state", async () => {
  for (const page of [RootPage, HomePage]) {
    for (const [query, suffix] of [
      [{}, ""],
      // Page, status and date queries at the former home were already Matches bookmarks, not Best Slips state.
      [{ date: "2026-11-05", status: "finished", page: "2" }, "?date=2026-11-05&status=finished&page=2"],
      [{ league: ["39", "40"], page: "2" }, "?league=39&league=40&page=2"],
      [{ period: "today", q: "Home Club" }, "?period=today&q=Home+Club"],
    ]) {
      await assert.rejects(page({ params: Promise.resolve({ locale: "en" }), searchParams: Promise.resolve(query) }),
        error => error.digest === `NEXT_REDIRECT;replace;/en/matches${suffix};308;`);
    }
  }
});
