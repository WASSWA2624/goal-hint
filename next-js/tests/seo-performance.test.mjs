import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import nextConfig from "../next.config.ts";
import { privateHeaders } from "../src/server/http/private-http.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const privateSources = ["/analytics", "/api/analytics/:path*", "/admin", "/admin/:path*", "/api/admin/:path*", "/en/account", "/en/subscribe",
  "/api/account/:path*"];

test("flags and brand files are browser-cached while the private rules stay last and unchanged", async () => {
  const rules = await nextConfig.headers();
  assert.deepEqual(rules.filter(({ source }) => ["/:path*", "/flags/:file*", "/brand/:file*"].includes(source)), [
    { source: "/:path*", headers: [{ key: "X-Content-Type-Options", value: "nosniff" }] },
    { source: "/flags/:file*", headers: [{ key: "Cache-Control", value: "public, max-age=2592000, stale-while-revalidate=86400" }] },
    { source: "/brand/:file*", headers: [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }] },
  ]);
  const privateRules = rules.slice(-privateSources.length);
  assert.deepEqual(privateRules.map((rule) => rule.source), privateSources, "The private rules come last, so a repeated key still resolves to theirs.");
  const expected = Object.fromEntries(Object.entries(privateHeaders).filter(([key]) => key !== "X-Content-Type-Options"));
  for (const rule of privateRules) assert.deepEqual(Object.fromEntries(rule.headers.map(({ key, value }) => [key, value])), expected, rule.source);
  for (const dir of ["flags", "brand"]) assert.ok(readdirSync(join(root, "public", dir)).length > 0, `public/${dir} exists`);
});

test("only the reviewed offline entry and manifest opt into public caching; the worker always revalidates", async () => {
  const rules = await nextConfig.headers();
  for (const [source, marker] of [["/offline", "X-GoalHint-Offline-Entry"], ["/offline-manifest.json", "X-GoalHint-Offline-Manifest"]]) {
    const headers = Object.fromEntries(rules.find((rule) => rule.source === source).headers.map(({ key, value }) => [key, value]));
    assert.equal(headers[marker], "1");
    assert.equal(headers["Cache-Control"], "public, max-age=0, must-revalidate");
  }
  const worker = rules.find(({ source }) => source === "/offline-worker.js");
  assert.equal(worker.headers.find(({ key }) => key === "Cache-Control").value, "no-cache, no-store, must-revalidate");
});

// Static import graph: relative and `@/` imports are followed; type-only imports are erased by the compiler and skipped.
// A module ships to the browser once a "use client" module (or one it imports) reaches it. Server modules are walked only
// to find those boundaries: their own imports (server-side phone validation, for one) never reach a client chunk.
const sourceExtensions = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"];
const code = (file) => readFileSync(resolve(root, file), "utf8").replace(/\/\*[\s\S]*?\*\//gu, "").replace(/^\s*\/\/.*$/gmu, "");
const moduleName = (file) => relative(root, file).replaceAll("\\", "/");
function resolveImport(from, specifier) {
  const base = specifier.startsWith("@/") ? join(root, "src", specifier.slice(2)) : specifier.startsWith(".") ? resolve(dirname(from), specifier) : null;
  if (base === null) return null;
  const file = sourceExtensions.map((extension) => base + extension).find((path) => existsSync(path) && statSync(path).isFile());
  assert.ok(file, `${specifier} resolves from ${moduleName(from)}`);
  return file;
}
function importsOf(file) {
  const text = code(file), specifiers = [];
  for (const [, typeOnly, clause, specifier] of text.matchAll(/(?:^|[\n;])\s*(?:import|export)\s+(type\s+)?([\w$*\s{},]*?)\s*from\s*["']([^"']+)["']/gu)) {
    const named = clause.trim().match(/^\{([\s\S]*)\}$/u)?.[1].split(",").map((name) => name.trim()).filter(Boolean);
    if (!typeOnly && !(named?.length && named.every((name) => name.startsWith("type ")))) specifiers.push(specifier);
  }
  for (const [, specifier] of text.matchAll(/(?:^|[\n;])\s*import\s*["']([^"']+)["']/gu)) specifiers.push(specifier);
  for (const [, specifier] of text.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/gu)) specifiers.push(specifier);
  return { client: /^\s*["']use client["']/u.test(text), specifiers };
}
/** Every module and package the browser loads for these roots, each with the import chain that brought it in. */
function clientGraph(roots) {
  const chains = new Map(), seen = new Set(), queue = roots.map((path) => ({ file: join(root, path), client: false, chain: [path] }));
  while (queue.length) {
    const item = queue.shift(), source = importsOf(item.file), client = item.client || source.client, name = moduleName(item.file);
    if (seen.has(`${client}:${name}`)) continue;
    seen.add(`${client}:${name}`);
    if (client && !chains.has(name)) chains.set(name, item.chain);
    for (const specifier of source.specifiers) {
      const target = resolveImport(item.file, specifier);
      if (target === null) { if (client && !chains.has(specifier)) chains.set(specifier, [...item.chain, specifier]); }
      else if (/\.tsx?$/u.test(target) && !moduleName(target).startsWith("src/server/generated/")) {
        queue.push({ file: target, client, chain: [...item.chain, moduleName(target)] });
      }
    }
  }
  return chains;
}
const heavy = /^(?:libphonenumber-js|iso-3166)(?:\/|$)|^src\/(?:components\/ui\/phone-input\.tsx|domain\/phone-(?:mobile|countries)\.ts|components\/analytics\/dashboard\/dashboard-styles\.tsx)$/u;
const leaks = (graph) => [...graph].filter(([name]) => heavy.test(name)).map(([, chain]) => chain.join(" -> "));

// Every public page, found on disk so a new one is covered too; the account and subscribe pages hold the phone field.
const publicPages = () => readdirSync(join(root, "src/app/[locale]"), { recursive: true }).map((path) => `src/app/[locale]/${path.replaceAll("\\", "/")}`)
  .filter((path) => path.endsWith("/page.tsx") && !/^src\/app\/\[locale\]\/(?:account|subscribe)\//u.test(path)).sort();

test("the root layout, public shell and public pages ship no phone library, country list or owner dashboard styles", () => {
  const pages = publicPages();
  for (const page of ["page.tsx", "matches/page.tsx", "matches/[fixtureId]/[slug]/page.tsx", "performance/page.tsx", "slips/page.tsx", "predictions/[date]/page.tsx",
    "contact/page.tsx", "privacy/page.tsx", "terms/page.tsx", "how-it-works/page.tsx", "help/page.tsx"]) assert.ok(pages.includes(`src/app/[locale]/${page}`), page);
  assert.ok(!pages.some((path) => /\/(?:account|subscribe)\//u.test(path)), "the account and subscribe pages are left out");
  const roots = ["src/app/layout.tsx", "src/app/page.tsx", "src/app/not-found.tsx", "src/app/[locale]/layout.tsx", "src/app/_components/public-shell.tsx",
    "src/app/_components/information-shell.tsx", "src/app/_components/app-providers.tsx", "src/components/members/account-link.tsx",
    "src/components/members/member-login-notice.tsx", ...pages];
  const graph = clientGraph(roots);
  for (const name of ["src/components/ui/controls.tsx", "src/components/members/account-link.tsx", "src/domain/phone.ts", "styled-components"]) {
    assert.ok(graph.has(name), `${name} is in the shell's client graph`);
  }
  assert.deepEqual(leaks(graph), []);
});

test("phone fields still load the phone library where they render", () => {
  for (const path of ["src/components/members/account-auth-form.tsx", "src/components/members/subscribe-controls.tsx", "src/components/admin/subscriber-directory.tsx"]) {
    const graph = clientGraph([path]);
    for (const name of ["src/components/ui/phone-input.tsx", "src/domain/phone-mobile.ts", "libphonenumber-js/mobile", "iso-3166"]) assert.ok(graph.has(name), `${path}: ${name}`);
  }
  assert.doesNotMatch(code("src/components/ui/controls.tsx"), /PhoneInput|libphonenumber|phone-countries|domain\/phone/u, "controls.tsx neither holds nor re-exports the phone field");
  assert.doesNotMatch(code("src/domain/phone.ts"), /libphonenumber/u, "formatPhone and normalizePhone load no metadata");
});
