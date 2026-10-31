import assert from "node:assert/strict";
import test from "node:test";
import { accountSection, accountSectionHref, accountSections } from "../src/domain/account-navigation.ts";

test("account sections validate deep links and default unknown or repeated input to overview", () => {
  for (const section of accountSections) assert.equal(accountSection(section), section);
  for (const value of [undefined, null, [], ["password", "phone"], "constructor", "__proto__", "filters", "https://other.test", "PASSWORD"])
    assert.equal(accountSection(value), "overview");
});

test("section URLs retain only validated feed return destinations", () => {
  for (const section of accountSections) {
    const url = new URL(accountSectionHref("en", section, "/en/slips"), "https://goal-hint.test");
    assert.equal(url.pathname, "/en/account");
    assert.equal(url.searchParams.get("section"), section === "overview" ? null : section);
    assert.equal(url.searchParams.get("return"), "/en/slips");
    assert.equal(accountSection(url.searchParams.get("section")), section);
  }
  for (const unsafe of ["https://other.test", "//other.test", "/en/account?section=password", "/en/slips?section=phone", "/en/matches#id"])
    assert.equal(accountSectionHref("en", "phone", unsafe), "/en/account?section=phone");
  assert.equal(accountSectionHref("bad-locale", "overview"), "/en/account");
});
