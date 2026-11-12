/* eslint-disable @typescript-eslint/no-unused-vars -- Playwright CLI evaluates this function through run-code --filename. */
/** Run against the synthetic members rendering fixture. Native handoffs and clipboard writes are stubbed. */
async function verifyInviteFriends(page) {
  const origin = new URL(page.url()).origin;
  if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(origin).hostname)) throw new Error("Use a local acceptance fixture.");
  const browser = page.context().browser();
  const code = "a".repeat(32);
  const direct = [false, true].flatMap(touch => ["light", "dark"].flatMap(theme =>
    [false, true].map(member => ({ touch, theme, member, share: touch ? "bridge" : "web" }))));
  const scenarios = [
    ...direct,
    { touch: true, theme: "light", member: false, share: "legacy-bridge" },
    { touch: false, theme: "light", member: false, share: "unavailable" },
    { touch: true, theme: "dark", member: true, share: "failure" },
    { touch: true, theme: "light", member: true, share: "cancel" },
  ];
  const results = [];
  for (const scenario of scenarios) {
    const { touch, theme, member, share } = scenario;
    const viewport = touch ? { width: 390, height: 844 } : { width: 1440, height: 900 };
    const context = await browser.newContext({ viewport, isMobile: touch, hasTouch: touch, colorScheme: theme });
    const assert = (condition, message) => {
      if (!condition) throw new Error(`${touch ? "touch" : "desktop"} ${theme} ${member ? "member" : "guest"} ${share}: ${message}`);
    };
    try {
      if (member) await context.addCookies([{ name: "goal-hint-member", value: "a".repeat(43), url: origin, httpOnly: true }]);
      await context.addInitScript(({ theme, share }) => {
        localStorage.setItem("goal-hint-theme", theme);
        window.inviteFixture = { handoffs: [], copies: [] };
        const record = (transport, payload) => {
          window.inviteFixture.handoffs.push({ transport, payload, active: navigator.userActivation.isActive });
        };
        Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async text => {
          window.inviteFixture.copies.push(text);
        } } });
        Object.defineProperty(navigator, "canShare", { configurable: true, value: () => true });
        Object.defineProperty(navigator, "share", { configurable: true, value: share === "unavailable" ? undefined : async payload => {
          record("web", payload);
          if (share === "cancel") throw new DOMException("Cancelled", "AbortError");
          if (share === "failure") throw new DOMException("Unavailable", "NotAllowedError");
        } });
        if (share === "bridge" || share === "legacy-bridge") window.goalHintNativeShare = {
          version: 1, readableReferences: true, ...(share === "bridge" ? { publicInvitations: true } : {}),
          share: async payload => { record("bridge", payload); return "handed-off"; },
        };
      }, { theme, share });
      const sample = await context.newPage();
      sample.setDefaultTimeout(20_000);
      const activate = control => touch ? control.tap() : control.click();
      const response = sample.waitForResponse(item => new URL(item.url()).pathname === "/api/account/session" && item.request().method() === "GET");
      await sample.goto(`${origin}/en/matches`, { waitUntil: "domcontentloaded" });
      const identity = await (await response).json();
      assert(member ? Boolean(identity.phone) && identity.referralCode === code : identity.phone === null && !identity.referralCode,
        "synthetic member session does not match the expected identity");
      await sample.waitForFunction(mode => getComputedStyle(document.documentElement).colorScheme === mode, theme);
      const nav = sample.locator(`[data-responsive-navigation="${touch ? "mobile" : "desktop"}"]`).first();
      const invite = nav.locator('button[data-nav-key="invite-friends"]');
      await invite.waitFor({ state: "attached" });
      await sample.evaluate(() => document.fonts.ready);
      const more = nav.locator("[data-nav-more] details");
      const overflow = await invite.evaluate(element => Boolean(element.closest("details")));
      if (overflow) await activate(more.locator("summary"));
      if (touch && overflow) {
        const matchesMenuSizing = await more.locator("ul").evaluate(menu => {
          const dimensions = key => {
            const item = menu.querySelector(`[data-nav-key="${key}"]`);
            const icon = item.querySelector("svg").getBoundingClientRect();
            return [getComputedStyle(item.querySelector("span")).fontSize, icon.width, icon.height].join(",");
          };
          return dimensions("invite-friends") === dimensions("performance");
        });
        assert(matchesMenuSizing, "Invite friends text and icon sizing differ from the other More controls");
      }
      const before = sample.url(), url = member ? `https://goalhint.com/r/${code}` : "https://goalhint.com";
      await activate(invite);
      assert(!overflow || !await more.evaluate(menu => menu.open), "selecting Invite friends keeps More open");
      const dialog = sample.getByRole("dialog", { name: "Invite friends", exact: true });
      if (share !== "unavailable") {
        await sample.waitForFunction(() => window.inviteFixture.handoffs.length === 1);
        const [call] = await sample.evaluate(() => window.inviteFixture.handoffs);
        assert(call.transport === (share === "bridge" ? "bridge" : "web") && call.active, "sharing did not run once in the original activation");
        assert(call.payload.title === "Goal Hint" && call.payload.url === url
          && /Goal Hint/i.test(call.payload.text) && /football/i.test(call.payload.text),
          "the share payload does not match the invitation");
      }
      if (share === "failure" || share === "unavailable") {
        await dialog.waitFor();
        const link = dialog.locator('input[name="referralLink"]');
        assert(await link.inputValue() === url && await link.evaluate(input => input.readOnly), "fallback does not show the expected share link");
        await activate(dialog.getByRole("button", { name: "Copy link", exact: true }));
        await sample.waitForFunction(() => window.inviteFixture.copies.length === 1);
        assert(await sample.evaluate(() => window.inviteFixture.copies[0]) === url, "copy did not use the displayed invitation link");
        await sample.keyboard.press("Escape");
        await dialog.waitFor({ state: "hidden" });
        await sample.waitForFunction(({ touch, overflow }) => {
          const navigation = document.querySelector(`[data-responsive-navigation="${touch ? "mobile" : "desktop"}"]`);
          const opener = navigation?.querySelector(overflow ? "[data-nav-more] summary" : 'button[data-nav-key="invite-friends"]');
          return document.activeElement === opener;
        }, { touch, overflow });
      } else {
        await sample.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        assert(!await dialog.isVisible(), "successful or cancelled native sharing opened the fallback dialog");
      }
      assert(sample.url() === before, "Invite friends navigated away from Matches");
      results.push({ ...scenario, overflow, passed: true });
    } finally { await context.close(); }
  }
  return results;
}
