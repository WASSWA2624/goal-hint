/** Full authentication journeys using the isolated synthetic member acceptance app. */
import assert from "node:assert/strict";

export async function verifyAuthenticationJourneys(page, { origin } = {}) {
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(origin).hostname), "Use the local synthetic fixture only");
  const context = page.context(), checks = [];
  const open = async (path) => {
    await page.goto(origin + path, { waitUntil: "domcontentloaded", timeout: 60_000 });
  };
  const fresh = async (view = "login") => {
    await context.clearCookies();
    await open(`/en/account?view=${view}`);
    assert.equal(await page.locator('meta[name="description"]').first().getAttribute("content"), "Isolated member acceptance fixture.");
    await page.waitForFunction(() => document.cookie.includes("member-fixture-scenario="));
  };
  const credentials = async (phone = "700000101", password = "Synthetic password") => {
    await page.locator("[data-phone-input]").fill(phone);
    await page.locator('input[name="password"]').fill(password);
  };
  const submit = () => page.locator('[data-account-auth] form').first().locator('button[type="submit"]').click();
  const home = async () => {
    await page.waitForURL(origin + "/en/matches");
    await page.locator("[data-fixture-feed]").waitFor();
  };
  const scenario = async (value) => {
    await page.locator("[data-fixture-controls] select").selectOption(value);
    await page.waitForFunction(expected => document.cookie.includes(`member-fixture-scenario=${expected}`), value);
  };
  const cookie = (name, value) => context.addCookies([{ name, value, url: origin }]);

  await fresh();
  await open("/en/subscribe?return=%2Fen%2Fbest-slips");
  assert.equal(new URL(page.url()).pathname, "/en/account");
  assert.equal(new URL(page.url()).searchParams.get("view"), "login");
  await page.locator('[data-account-auth] h1').filter({ hasText: "Login" }).waitFor();
  checks.push("Subscribe redirects guests to the canonical login page");

  for (const outcome of ["denied", "rate-limited", "unavailable"]) {
    await scenario(outcome);
    await credentials();
    await submit();
    await page.locator('[data-account-auth] [role="alert"]').waitFor();
    assert.equal(new URL(page.url()).pathname, "/en/account");
    assert.equal(await page.locator('[data-account-auth] button[type="submit"]').isEnabled(), true);
  }
  await scenario("success");
  await submit();
  await home();
  await page.locator("[data-account-menu]:visible").first().waitFor();
  checks.push("Invalid, throttled and unavailable login recover without losing the form");
  checks.push("Successful login opens Matches and updates header identity");

  for (const view of ["login", "register"]) {
    await open(`/en/account?view=${view}`);
    await home();
  }
  checks.push("Authenticated login and registration links do not reopen credential forms");

  await open("/en/account");
  await page.locator("[data-account-details]").waitFor();
  const secondTab = await context.newPage();
  try {
    await secondTab.goto(origin + "/en/account", { waitUntil: "domcontentloaded" });
    await secondTab.locator("[data-account-menu]:visible summary").first().click();
    await secondTab.locator('[data-account-menu] button[type="submit"]:visible').first().click();
    await secondTab.waitForURL(origin + "/en/matches");
    await page.bringToFront();
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page.locator("[data-account-auth]").waitFor();
    assert.equal(await page.locator("[data-account-details]").count(), 0);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator("[data-account-auth]").waitFor();
  } finally { await secondTab.close(); }
  checks.push("Other-tab logout and refresh remove the protected account workspace");

  await fresh("register");
  await credentials();
  await submit();
  await page.locator('[data-account-verification="account"]').waitFor();
  assert.equal(new URL(page.url()).searchParams.get("view"), "verify");
  await page.getByRole("button", { name: "Back to login", exact: true }).click();
  await page.waitForURL(origin + "/en/account?view=login");
  await page.locator('[data-account-auth] h1').filter({ hasText: "Login" }).waitFor();
  assert.equal((await context.cookies()).some(value => value.name === "goal-hint-member"), false);
  checks.push("Abandoning registration clears its restricted session and returns to Login");

  await fresh("register");
  await credentials();
  await submit();
  await page.locator('[data-account-verification="account"]').waitFor();
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator('[data-account-verification="account"]').waitFor();
  await page.getByRole("button", { name: "Have a code?", exact: true }).click();
  await page.locator('input[name="code"]').fill("000000");
  await submit();
  await page.locator('[data-account-auth] [role="alert"]').waitFor();
  await page.locator('input[name="code"]').fill("123456");
  await submit();
  await home();
  checks.push("Registration survives refresh, rejects an invalid code and finishes at Matches");

  await fresh("forgot");
  await page.locator("[data-phone-input]").fill("700000101");
  await page.getByRole("button", { name: "Have a code?", exact: true }).click();
  await page.locator('input[name="code"]').fill("123456");
  await submit();
  await page.locator("[data-account-reset]").waitFor();
  await page.getByLabel("New password", { exact: true }).fill("Synthetic new password");
  await page.getByLabel("Confirm new password", { exact: true }).fill("Synthetic new password");
  await submit();
  await home();
  checks.push("Recovery code and replacement password finish at Matches");

  for (const [token, selector] of [["v", '[data-account-verification="account"]'], ["r", "[data-account-reset]"]]) {
    await context.clearCookies();
    await cookie("goal-hint-member", token.repeat(43));
    await open("/en/subscribe");
    assert.equal(new URL(page.url()).pathname, "/en/account");
    await page.locator(selector).waitFor();
  }
  await context.clearCookies();
  await cookie("goal-hint-member", "x".repeat(43));
  await open("/en/subscribe");
  await page.locator('[data-account-auth] h1').filter({ hasText: "Login" }).waitFor();
  checks.push("Subscribe routes verification, reset-only and expired sessions correctly");

  await fresh();
  const loginApi = origin + "/api/account/login";
  for (const failure of ["html", "network"]) {
    await page.route(loginApi, route => failure === "html"
      ? route.fulfill({ status: 502, contentType: "text/html", body: "<html>Gateway error</html>" })
      : route.abort("failed"));
    await credentials();
    await submit();
    await page.locator('[data-account-auth] [role="alert"]').waitFor();
    assert.equal(await page.locator('[data-account-auth] button[type="submit"]').isEnabled(), true);
    await page.unroute(loginApi);
  }
  await submit();
  await home();
  checks.push("Malformed and interrupted responses allow an explicit successful retry");

  await fresh();
  await credentials("700000991", "Synthetic admin password");
  await submit();
  await page.waitForURL(origin + "/admin");
  await page.locator("[data-fixture-admin]").waitFor();
  await open("/en/matches");
  await page.locator('[data-nav-key="dashboard"]').first().waitFor({ state: "attached" });
  assert.equal(await page.locator('[data-nav-key="dashboard"]').first().getAttribute("href"), "/admin");
  if (!await page.locator('[data-nav-key="dashboard"]:visible').count())
    await page.locator('[data-nav-more] summary:visible').first().click();
  await page.locator('[data-nav-key="dashboard"]:visible').first().click();
  await page.waitForURL(origin + "/admin");
  const adminTab = await context.newPage();
  let releaseSession, sessionStarted;
  const heldSession = new Promise(resolve => { releaseSession = resolve; });
  const firstSession = new Promise((resolve, reject) => {
    sessionStarted = resolve;
    setTimeout(() => reject(new Error("The admin page did not request its initial session.")), 20_000).unref();
  });
  await adminTab.route(origin + "/api/account/session", async route => {
    sessionStarted();
    await heldSession;
    await route.continue();
  });
  try {
    await adminTab.goto(origin + "/admin", { waitUntil: "domcontentloaded" });
    await adminTab.locator("[data-fixture-admin]").waitFor();
    await firstSession;
    await page.locator('[data-fixture-admin] button[type="submit"]').click();
    await home();
    releaseSession();
    await adminTab.bringToFront();
    await adminTab.evaluate(() => window.dispatchEvent(new Event("focus")));
    await adminTab.locator("[data-account-auth]").waitFor();
    assert.equal(await adminTab.locator("[data-fixture-admin]").count(), 0);
  } finally { releaseSession(); await adminTab.close(); }
  await page.goBack({ waitUntil: "domcontentloaded" });
  await page.locator("[data-account-auth]").waitFor();
  assert.equal(await page.locator("[data-fixture-admin]").count(), 0);
  checks.push("Administrator login and Dashboard open Overview; logout, initial identity-read races and Back do not restore access");
  return { passed: true, checks };
}
