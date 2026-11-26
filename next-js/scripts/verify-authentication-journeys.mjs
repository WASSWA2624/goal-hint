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
  const confirmation = page.getByRole("dialog", { name: "Confirm your phone number" });
  const confirmSignup = () => confirmation.getByRole("button", { name: "Confirm", exact: true }).click();
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
    const alert = page.locator('[data-account-auth] [role="alert"]');
    await (outcome === "denied" ? alert.filter({ hasText: "The phone number or password is incorrect." }) : alert).waitFor();
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
  const registrationPosts = [];
  const recordRegistration = request => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/api/account/register") registrationPosts.push(request);
  };
  page.on("request", recordRegistration);
  try {
    await submit();
    await confirmation.getByText("+256 700 000 101", { exact: true }).waitFor();
    await confirmation.getByRole("button", { name: "Cancel", exact: true }).click();
    await confirmation.waitFor({ state: "hidden" });
    assert.equal(registrationPosts.length, 0);
    await submit();
    await confirmation.getByRole("button", { name: "Edit number", exact: true }).click();
    await confirmation.waitFor({ state: "hidden" });
    assert.equal(await page.locator('input[name="password"]').inputValue(), "Synthetic password");
    await page.locator("[data-phone-input]").fill("700000102");
    await submit();
    await confirmation.getByText("+256 700 000 102", { exact: true }).waitFor();
    assert.equal(registrationPosts.length, 0);
    await confirmSignup();
    await home();
    assert.equal(registrationPosts.length, 1);
    assert.equal(registrationPosts[0].postDataJSON().phone, "256700000102");
  } finally { page.off("request", recordRegistration); }
  checks.push("Signup confirms the normalized number and allows Cancel and Edit before its only write");
  assert.equal(await page.locator('[data-account-verification="account"]').count(), 0);
  assert.equal((await context.cookies()).find(value => value.name === "goal-hint-member")?.value, "n".repeat(43));
  await open("/en/account");
  await page.locator("[data-account-details]").waitFor();
  checks.push("Regular signup opens Matches and Account with a full session");

  await fresh("register");
  await scenario("duplicate-phone");
  await credentials();
  await submit();
  await confirmSignup();
  await page.getByRole("alert").filter({ hasText: "This phone number already has an account." }).waitFor();
  await confirmation.waitFor({ state: "hidden" });
  assert.equal((await context.cookies()).some(value => value.name === "goal-hint-member"), false);
  checks.push("A duplicate signup reports the conflict without creating a session");

  await fresh("register");
  await scenario("automatic-trial");
  await credentials();
  await submit();
  await confirmSignup();
  await home();
  await open("/en/account?section=subscription");
  await page.locator('[data-free-trial="active"]').waitFor();
  checks.push("Eligible signup goes directly to Matches and keeps its automatically activated trial");

  const legacyVerification = page.locator('[data-account-verification="account"][data-verification-step="code"]');
  const startLegacyVerification = async () => {
    await fresh();
    await scenario("pending-verification");
    await credentials();
    await submit();
    await legacyVerification.waitFor();
    assert.equal(new URL(page.url()).searchParams.get("view"), "verify");
    assert.equal(await legacyVerification.locator('form[action="/api/account/verification"]').count(), 0);
  };
  await startLegacyVerification();
  await legacyVerification.getByRole("button", { name: "Back to login", exact: true }).click();
  await page.waitForURL(origin + "/en/account?view=login");
  await page.locator('[data-account-auth] h1').filter({ hasText: "Login" }).waitFor();
  assert.equal((await context.cookies()).some(value => value.name === "goal-hint-member"), false);
  checks.push("Leaving legacy verification clears its restricted session");

  await startLegacyVerification();
  await page.reload({ waitUntil: "domcontentloaded" });
  await legacyVerification.waitFor();
  await legacyVerification.locator('input[name="code"]').fill("000000");
  await submit();
  await page.locator('[data-account-auth] [role="alert"]').waitFor();
  await legacyVerification.locator('input[name="code"]').fill("123456");
  await submit();
  await home();
  checks.push("Legacy verification survives refresh, rejects an invalid code, and accepts a valid existing code");

  await open("/en/account?section=phone");
  const phoneChange = page.locator('form[action="/api/account/phone"]');
  await phoneChange.locator("[data-phone-input]").fill("700000102");
  await phoneChange.locator('input[name="currentPassword"]').fill("Synthetic current password");
  await phoneChange.locator('button[type="submit"]').click();
  await page.waitForURL(url => url.pathname === "/en/account" && url.searchParams.get("view") === "forgot");
  const phoneRecovery = page.locator('[data-account-verification="password-reset"][data-verification-step="delivery"]');
  await phoneRecovery.waitFor();
  assert.equal(await page.locator("[data-account-details]").count(), 0);
  checks.push("Changing a phone with the current password enters restricted Forgot password recovery");

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

  await open("/en/account?section=password");
  const passwordChange = page.locator('form[action="/api/account/password"]');
  await passwordChange.getByLabel("New password", { exact: true }).fill("x");
  await passwordChange.getByLabel("Confirm password", { exact: true }).fill("y");
  const savePassword = passwordChange.getByRole("button", { name: "Save password" });
  await savePassword.click();
  await passwordChange.getByRole("alert").filter({ hasText: "The passwords do not match." }).waitFor();
  await passwordChange.getByLabel("Confirm password", { exact: true }).fill("x");
  await savePassword.click();
  await page.waitForURL(origin + "/en/account?status=password-changed");
  await page.locator("[data-account-details]").waitFor();
  checks.push("Signed-in changes reject mismatches and accept a one-character password");

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
    await page.locator('[data-account-auth] [role="alert"]').filter({ hasText: failure === "html"
      ? "Unable to complete this request." : "Check your internet connection and try again." }).waitFor();
    assert.equal(await page.locator('[data-account-auth] button[type="submit"]').isEnabled(), true);
    await page.unroute(loginApi);
  }
  let loginWrites = 0;
  await page.route(loginApi, route => { loginWrites++; return route.continue(); });
  await page.locator('form[action="/api/account/login"]').evaluate(form => {
    form.requestSubmit();
    form.requestSubmit();
  });
  await home();
  assert.equal(loginWrites, 1);
  await page.unroute(loginApi);
  checks.push("Malformed and interrupted responses allow an explicit successful retry");
  checks.push("Consecutive submissions send exactly one login request");

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
