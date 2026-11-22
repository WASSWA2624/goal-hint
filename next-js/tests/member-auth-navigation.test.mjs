import assert from "node:assert/strict";
import test from "node:test";
import { matchReturnPath, memberAuthPath, memberHomePath, memberLandingPath, memberLoginPath, memberReturnPath, signedOutPath } from "../src/domain/member-navigation.ts";
import { subscriberHref } from "../src/domain/subscriber-navigation.ts";

const sharedSlip = `/s/${"a".repeat(32)}`;
const paymentReview = "/admin/payments?paymentId=7d444840-9dc0-4f60-9b18-050fc43b8813";

test("a signed-in match unlock carries a canonical local match into and back from Subscribe", () => {
  const target = "/en/matches/a-17/sample-home-away";
  const url = new URL(subscriberHref(true, target), "https://goal-hint.test");
  assert.equal(url.pathname, "/en/subscribe");
  assert.equal(matchReturnPath(memberReturnPath(url.searchParams.get("return"))), target);
  for (const path of ["/en/matches", "//other.test/en/matches/1/home-away", "https://other.test/en/matches/1/home-away",
    "/en/matches/1/../admin", "/en/matches/1/home-away?next=external", "/en/matches/1/%2f", paymentReview, [target]]) {
    assert.equal(matchReturnPath(path), null);
  }
});

test("authentication links keep a validated journey separate from the requested auth view", () => {
  assert.equal(memberAuthPath(), memberLoginPath);
  for (const view of ["login", "register", "forgot", "verify", "new-password"]) {
    for (const returnTo of ["/en/matches", "/en/best-slips", sharedSlip, paymentReview]) {
      const url = new URL(memberAuthPath(view, returnTo), "https://goal-hint.test");
      assert.equal(url.pathname, "/en/account");
      assert.equal(url.searchParams.get("view"), view);
      assert.equal(url.searchParams.get("return"), returnTo);
    }
    for (const unsafe of ["https://other.test", "//other.test", "/en/account?view=register", "/en/matches#secret", [sharedSlip]]) {
      const url = new URL(memberAuthPath(view, unsafe), "https://goal-hint.test");
      assert.equal(url.searchParams.has("return"), false);
      assert.equal(url.searchParams.get("view"), view);
    }
  }
});

test("authentication and logout land on Matches while role-specific deep links stay constrained", () => {
  assert.equal(memberHomePath, "/en/matches");
  assert.equal(signedOutPath, memberHomePath);
  assert.equal(memberReturnPath("/en/best-slips"), "/en/best-slips");
  for (const destination of [undefined, "/en", "/en/best-slips", "/en/subscribe", "https://other.test", "//other.test"]) {
    assert.equal(memberLandingPath(false, destination), "/en/matches");
    assert.equal(memberLandingPath(true, destination), "/admin");
  }
  assert.equal(memberLandingPath(false, sharedSlip), sharedSlip);
  assert.equal(memberLandingPath(true, sharedSlip), "/admin");
  assert.equal(memberLandingPath(true, paymentReview), paymentReview);
  assert.equal(memberLandingPath(false, paymentReview), "/en/matches");
  assert.equal(memberLandingPath(true, `${paymentReview}&action=approve`), "/admin");
});
