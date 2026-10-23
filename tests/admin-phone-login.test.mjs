import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createOwnerLoginHandler } from "../src/server/admin/owner-auth.ts";
import { createLoginHandler } from "../src/server/analytics/analytics-http.ts";

const loginPath = "/en/account?view=login";
const request = (path, body, headers = {}) => new Request(`http://localhost:3000${path}`, { method: "POST", body,
  headers: { host: "localhost:3000", "sec-fetch-site": "same-origin", "content-type": "application/x-www-form-urlencoded", ...headers } });

test("legacy dashboard login endpoints ignore credentials and direct every same-origin request to the shared form", async () => {
  for (const [path, factory] of [["/api/admin/login", createOwnerLoginHandler], ["/api/analytics/login", createLoginHandler]]) {
    for (const body of ["username=owner&password=private", "username=256700000991&password=private", "phone=256700000101&password=private", "not a form", "x".repeat(8192)]) {
      const sent = request(path, body), response = await factory()(sent);
      assert.equal(response.status, 303, path);
      assert.equal(response.headers.get("location"), loginPath, path);
      assert.equal(response.headers.get("set-cookie"), null);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.equal(sent.bodyUsed, false, "A retired endpoint never consumes or authenticates credentials.");
      assert.equal(await response.text(), "");
    }
  }
});

test("legacy login redirects refuse cross-site posts before reading their body", async () => {
  for (const factory of [createOwnerLoginHandler, createLoginHandler]) {
    for (const headers of [{ "sec-fetch-site": "cross-site" }, { "sec-fetch-site": "same-site" },
      { "sec-fetch-site": "", origin: "https://outside.example" }]) {
      const sent = request("/api/admin/login", "username=owner&password=private", headers), response = await factory()(sent);
      assert.equal(response.status, 403); assert.equal(response.headers.get("set-cookie"), null);
      assert.equal(response.headers.get("location"), null); assert.equal(sent.bodyUsed, false);
    }
  }
});

test("private pages use the common phone/password screen without rendering a second credential form", async () => {
  for (const file of ["src/app/admin/page.tsx", "src/app/admin/subscribers/page.tsx", "src/app/analytics/page.tsx"]) {
    const source = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
    assert.match(source, /redirectToAccountLogin\(\)/u, file);
    assert.doesNotMatch(source, /AnalyticsLogin|Owner username|Admin sign-in/u, file);
  }
  const form = await readFile(new URL("../src/components/members/account-auth-form.tsx", import.meta.url), "utf8");
  assert.match(form, /<PhoneInput\b[^>]*name="phone"/u);
  assert.match(form, /<PasswordInput\b[\s\S]*?current=\{view === "login"\}/u);
  assert.doesNotMatch(form, /\/api\/(?:admin|analytics)\/login|Owner username/u);
});
