import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { gateDetailResponse, gateFixture } from "../src/domain/paywall.ts";
import { matchDetailResponseSchema } from "../src/domain/match-detail.ts";
import { canonicalMatchSlug } from "../src/domain/match-slug.ts";
import { cardFixture } from "./helpers/match-card-fixtures.mjs";
import { scenarios } from "./helpers/paywall-fixtures.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const anonymous = { tier: "free", signedIn: false }, member = { tier: "free", signedIn: true }, full = { tier: "full", signedIn: true };
const slug = canonicalMatchSlug("Example Home FC", "Example Away FC");
const open = { cycle: { state: "open", mode: "current", ordinal: 1, lockedAt: null, voidReason: null } };
const upcoming = (fixtureId, overrides = {}) => cardFixture({ fixtureId, status: "scheduled", score: null, ...open, ...overrides }, "ai", null);
const forecastless = (fixtureId) => upcoming(fixtureId, { forecast: null, update: { prediction: "outside-window", result: "current" } });
const prediction = /data-pick-selection=|data-probability-meter=|data-prediction=|data-pick-price=|data-card-odds=/u;
// The pick markup scripts/verify-production-paywall.py (CARD_PICK) inspects on anonymous feed pages.
const cardPick = (html) => [...html.matchAll(/\b(data-(?:market|prediction|outcome|pick-selection|probability-meter|pick-price|pick-odds))="([^"]*)"/gu)]
  .map(([, name, value]) => `${name}=${value}`);

/**
 * Server-renders the real card and match-page sections the way a crawler receives them. The child runs without the
 * react-server condition, compiles TSX with TypeScript and resolves the "@/" alias; styled-components loads its ESM build.
 */
const program = String.raw`
  import { registerHooks, createRequire } from "node:module";
  import { existsSync, readFileSync, statSync } from "node:fs";
  import { pathToFileURL, fileURLToPath } from "node:url";
  const root = pathToFileURL(process.cwd() + "/"), require = createRequire(root), ts = require("typescript");
  const probe = (base) => ["", ".ts", ".tsx", "/index.ts", "/index.tsx"].map((suffix) => base + suffix).find((path) => existsSync(path) && statSync(path).isFile());
  const styled = new URL("node_modules/styled-components/dist/styled-components.esm.js", root).href;
  registerHooks({
    resolve(specifier, context, next) {
      if (specifier === "styled-components") return { url: styled, format: "module", shortCircuit: true };
      const base = specifier.startsWith("@/") ? fileURLToPath(new URL("src/" + specifier.slice(2), root))
        : specifier.startsWith(".") && context.parentURL?.includes("/src/") ? fileURLToPath(new URL(specifier, context.parentURL)) : null;
      const found = base && probe(base);
      if (found) return { url: pathToFileURL(found).href, shortCircuit: true };
      try { return next(specifier, context); }
      catch (error) { if (base || error.code !== "ERR_MODULE_NOT_FOUND") throw error; return { url: pathToFileURL(require.resolve(specifier)).href, shortCircuit: true }; }
    },
    load(url, context, next) {
      const path = url.startsWith("file:") ? fileURLToPath(url) : null;
      if (url === styled) return { format: "module", source: readFileSync(path, "utf8"), shortCircuit: true };
      if (url.startsWith(root.href) && url.endsWith(".json")) return { format: "module", source: "export default " + readFileSync(path, "utf8"), shortCircuit: true };
      if (!/\/src\/.*\.tsx?$/u.test(url)) return next(url, context);
      const { outputText } = ts.transpileModule(readFileSync(path, "utf8"), { fileName: path,
        compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
      return { format: "module", source: outputText, shortCircuit: true };
    },
  });
  const source = (path) => import(new URL(path, root).href);
  const [{ createElement: h }, { renderToStaticMarkup }, { ThemeProvider }, { lightTheme }, { MatchCard }, { Verdict }, { MarketsCard }, { AnalysisDrawer },
    { DetailsProvider }, { createMessages }] = await Promise.all([import("react"), import("react-dom/server"), import("styled-components"),
    source("src/styles/theme.ts"), source("src/components/match/match-card.tsx"), source("src/components/match/details/verdict.tsx"),
    source("src/components/match/details/markets-card.tsx"), source("src/components/match/details/analysis-drawer.tsx"),
    source("src/components/match/details/details-ui.tsx"), source("src/i18n/messages.ts")]);
  const { cards, details } = JSON.parse(readFileSync(0, "utf8")), messages = createMessages("en");
  const html = (element) => renderToStaticMarkup(h(ThemeProvider, { theme: lightTheme }, element));
  const context = (data) => ({ data, preview: null, locale: "en", messages, go() {}, update() {}, home: "Synthetic A", away: "Synthetic B",
    fixtureId: data.fixture.fixtureId, history: null, offer: null });
  process.stdout.write(JSON.stringify({
    cards: cards.map((props) => html(h(MatchCard, { locale: "en", ...props }))),
    details: details.map((data) => Object.fromEntries([["verdict", Verdict], ["markets", MarketsCard], ["analysis", AnalysisDrawer]]
      .map(([name, Section]) => [name, html(h(DetailsProvider, { value: context(data) }, h(Section)))]))),
  }));
`;
function render({ cards = [], details = [] }) {
  const output = execFileSync(process.execPath, ["--input-type=module", "--eval", program], { cwd: root, input: JSON.stringify({ cards, details }),
    encoding: "utf8", windowsHide: true, timeout: 60_000, env: { ...process.env, NODE_OPTIONS: "" } });
  return JSON.parse(output);
}
const anchors = (html) => [...html.matchAll(/<a\b[^>]*\bhref="([^"]*)"/gu)].map((match) => match[1].replaceAll("&amp;", "&"));
const pickState = (html) => html.match(/data-pick-state="([a-z]+)"/u)?.[1];

test("the shared card keeps its canonical match link when an unfinished forecast is gated", () => {
  const locked = gateFixture(upcoming("card-gated"), anonymous);
  assert.equal(locked.forecast.gated, true);
  const { cards: [guest, signedIn, subscriber] } = render({ cards: [
    { fixture: locked, gated: true, analysisSlug: slug }, { fixture: gateFixture(upcoming("card-gated"), member), gated: true, analysisSlug: slug },
    { fixture: upcoming("card-gated"), analysisSlug: slug }] });
  for (const html of [guest, signedIn, subscriber]) {
    assert.deepEqual(anchors(html), [`/en/matches/card-gated/${slug}`]);
    assert.match(anchors(html)[0], /^\/en\/matches\/card-gated\/[a-z0-9-]+$/u);
    assert.doesNotMatch(html, /return=|\/en\/account|\/en\/subscribe/u);
  }
  // Standalone locked cards carry no prediction, price, meter or public chance value.
  for (const html of [guest, signedIn]) {
    assert.equal(pickState(html), "subscriber");
    assert.doesNotMatch(html, prediction);
    assert.deepEqual(cardPick(html), []);
    assert.match(html, />Locked prediction</u);
    assert.match(html, /data-subscriber-notice="true"[^>]*title="Unlock prediction"[^>]*>Get access/u);
    assert.match(html, /data-public-probability/u);
  }
  assert.equal(signedIn, guest);
  assert.match(subscriber, /data-pick-selection=/u);
});

test("an unfinished card without a published forecast shows why, not a lock", () => {
  const stored = forecastless("card-none"), gated = gateFixture(stored, anonymous);
  // The free payload already says no forecast was published: gating keeps null and never hides a forecast as null.
  assert.equal(gated.forecast, null);
  assert.equal(gateFixture(upcoming("card-some"), anonymous).forecast.gated, true);
  const { cards: [guest, subscriber] } = render({ cards: [{ fixture: gated, gated: true, analysisSlug: slug }, { fixture: stored, analysisSlug: slug }] });
  assert.equal(pickState(guest), "none");
  assert.doesNotMatch(guest, /Locked prediction|Locked market|Subscribe to see the prediction|data-public-probability/u);
  assert.match(guest, /<b data-mobile-only="">No prediction<\/b>/u);
  assert.match(guest, /Too early/u);
  assert.deepEqual(cardPick(guest), ["data-market=match-result", "data-prediction=none", "data-outcome=unavailable"]);
  assert.deepEqual(anchors(guest), [`/en/matches/card-none/${slug}`]);
  // Free and subscriber viewers get the same card: nothing beyond the subscriber's own no-prediction view.
  assert.equal(guest, subscriber);
});

test("a market filter outside the published families shows the subscriber's no-prediction card, not a lock", () => {
  const stored = upcoming("card-filtered");
  stored.forecast.markets = stored.forecast.markets.filter((item) => item.market.family !== "both-teams-to-score");
  const gated = gateFixture(stored, anonymous), markets = ["both-teams-to-score"];
  // The gated families already tell a free viewer the filtered market was never published.
  assert.equal(gated.forecast.families.includes("both-teams-to-score"), false);
  const { cards: [guest, subscriber, unfiltered] } = render({ cards: [{ fixture: gated, gated: true, analysisSlug: slug, markets },
    { fixture: stored, analysisSlug: slug, markets }, { fixture: gated, gated: true, analysisSlug: slug }] });
  assert.equal(pickState(guest), "none");
  assert.doesNotMatch(guest, /Locked prediction|Subscribe to see the prediction|data-public-probability/u);
  assert.match(guest, /data-no-pick="market"/u);
  assert.equal(guest, subscriber);
  assert.equal(pickState(unfiltered), "subscriber");
  assert.doesNotMatch(unfiltered, prediction);
});

test("a delivered forecast stays locked for free viewers, and completed matches including cancellation stay open", () => {
  // Fail closed: a whole forecast handed to a free viewer's card still renders locked, without its pick.
  const { cards: [whole, finished, canceled] } = render({ cards: [{ fixture: upcoming("card-whole"), gated: true, analysisSlug: slug },
    { fixture: gateFixture(cardFixture({ fixtureId: "card-final" }), anonymous), gated: true, analysisSlug: slug },
    { fixture: gateFixture(scenarios.canceled.feed.records[0], anonymous), gated: true, analysisSlug: slug }] });
  assert.equal(pickState(whole), "subscriber");
  assert.doesNotMatch(whole, prediction);
  assert.match(whole, />Locked prediction</u);
  assert.equal(pickState(finished), "settled");
  assert.match(finished, /data-pick-selection=""[^>]*title="Home or draw"[^>]*>1X</u);
  assert.notEqual(pickState(canceled), "subscriber");
  assert.match(canceled, /data-pick-selection=/u);
});

test("the match page locks the verdict, markets and analysis only over a published forecast", () => {
  const gate = (detail, access) => matchDetailResponseSchema.parse(gateDetailResponse(detail, access));
  const published = gate(scenarios.scheduled.detail, anonymous), none = gate(scenarios["prior-cycle"].detail, anonymous);
  // The prior cycle's revisions stay behind the gated history; only the current, empty forecast is public.
  assert.equal(published.snapshot.gated, true);
  assert.equal(none.snapshot, null);
  assert.deepEqual(none.history, { gated: true });
  const { details: [locked, guest, subscriber] } = render({ details: [published, none, gate(scenarios["prior-cycle"].detail, full)] });
  assert.match(locked.verdict, /Subscribe to unlock predictions, markets and odds\./u);
  assert.match(locked.verdict, /data-public-probability/u);
  assert.match(locked.markets, /Markets, predictions and odds are locked\./u);
  assert.match(locked.analysis, /Goal Hint analysis is for subscribers\./u);
  assert.match(guest.verdict, /data-featured-pick="none"/u);
  assert.match(guest.verdict, /No prediction published/u);
  assert.match(guest.verdict, /Awaiting prediction/u);
  assert.match(guest.markets, /data-section="markets"/u);
  assert.match(guest.markets, /0 of 4 published/u);
  assert.match(guest.analysis, /No prediction analysis is available for this cycle\./u);
  for (const html of Object.values(guest)) {
    assert.doesNotMatch(html, /Subscribe|locked\.|for subscribers|data-public-probability|return=/u);
    assert.doesNotMatch(html, /SENTINEL-|61\.7|62%/u);
  }
  // A free viewer reads exactly the subscriber's no-prediction sections.
  assert.deepEqual(guest, subscriber);
});
