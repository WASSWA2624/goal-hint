/** Run against the owned offline fixture and its local fault proxy. */
import assert from "node:assert/strict";
import { rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const { values } = parseArgs({ options: { origin: { type: "string" }, control: { type: "string" }, playwright: { type: "string" } } });
const root = new URL(values.origin);
assert.ok(["localhost", "127.0.0.1"].includes(root.hostname), "Use the loopback fault proxy.");
const control = path.resolve(values.control);
assert.ok(control.startsWith(path.resolve(".tmp") + path.sep), "Use an owned control file under .tmp.");
const { chromium } = await import(values.playwright ? pathToFileURL(path.resolve(values.playwright)).href : "playwright");

async function setFault(mode, delayMs = 0) {
  const temporary = control + ".new";
  await writeFile(temporary, JSON.stringify({ generation: "A", authState: "active",
    fault: mode ? { target: "document", mode, delayMs } : null }));
  await rename(temporary, control);
}

const target = new URL("/en/matches?when=today&recovery=fixture", root).href;
const offlineTarget = new URL("/en/matches?when=today&recovery=offline", root).href;
const slowTarget = new URL("/en/matches?when=today&recovery=timeout", root).href;
const browser = await chromium.launch({ channel: "chrome", headless: true });
const results = [];

// Use the document's normal navigation. DevTools-driven reloads can bypass the worker.
async function navigate(page, url) {
  const response = page.waitForNavigation({ timeout: 30_000 });
  await page.evaluate(destination => { setTimeout(() => location.assign(destination), 0); }, url);
  return response;
}

try {
  for (const theme of ["light", "dark"]) {
    const context = await browser.newContext({ colorScheme: theme, viewport: { width: theme === "dark" ? 390 : 1440, height: 844 } });
    try {
      await setFault(null);
      const page = await context.newPage();
      await page.goto(new URL("/en", root).href);
      await page.locator("[data-offline-fixture]").waitFor();
      await page.waitForFunction(async () => {
        if (!navigator.serviceWorker.controller) return false;
        return (await fetch("/offline-cache/status").then(response => response.json()).catch(() => null))?.ok === true;
      }, null, { polling: 500, timeout: 30_000 });

      await setFault("503");
      const unavailable = await navigate(page, target);
      assert.equal(unavailable.status(), 503);
      assert.equal(unavailable.fromServiceWorker(), true);
      await page.getByRole("heading", { name: "GoalHint is temporarily unavailable" }).waitFor();
      assert.equal(page.url(), target);
      await setFault(null);
      await page.getByRole("link", { name: "Try again" }).click();
      await page.locator("[data-offline-fixture]").waitFor();
      assert.equal(page.url(), target);

      await context.setOffline(true);
      await navigate(page, offlineTarget);
      await page.getByRole("heading", { name: "You’re offline" }).waitFor();
      await context.setOffline(false);
      await page.locator("[data-offline-fixture]").waitFor();
      assert.equal(page.url(), offlineTarget);

      let lastHealthy = offlineTarget;
      if (theme === "dark") {
        await setFault("delay-headers", 17_000);
        await navigate(page, slowTarget);
        await page.getByRole("heading", { name: "This page took too long to respond" }).waitFor();
        await setFault(null);
        await page.getByRole("link", { name: "Try again" }).click();
        await page.locator("[data-offline-fixture]").waitFor();
        lastHealthy = slowTarget;
      }

      await page.goto(new URL("/en/crash", root).href);
      await page.getByRole("button", { name: "Trigger render failure" }).click();
      await page.getByRole("heading", { name: "This page couldn’t load" }).waitFor();
      await page.waitForFunction(mode => document.querySelector('meta[name="color-scheme"]')?.content === mode, theme);
      await page.getByRole("link", { name: "Reload" }).click();
      await page.getByRole("button", { name: "Trigger render failure" }).waitFor();
      await page.goBack();
      await page.locator("[data-offline-fixture]").waitFor();
      assert.equal(page.url(), lastHealthy);
      await page.goForward();
      await page.getByRole("button", { name: "Trigger render failure" }).waitFor();
      results.push({ theme, server503: true, reconnect: true, runtime: true, history: true, timeout: theme === "dark" });
    } finally { await context.close(); }
  }
} finally {
  await setFault(null);
  await browser.close();
}
console.log(JSON.stringify({ chromium: browser.version(), results }));
