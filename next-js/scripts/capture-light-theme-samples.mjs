import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));

/** Capture with an existing Playwright Page; no additional browser dependency. */
export async function captureLightThemes(page, origin = "http://127.0.0.1:3107") {
  const url = new URL(origin);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    throw new Error("Capture requires a local synthetic review server.");
  }
  const palettes = JSON.parse(await readFile(path.join(root, "design/light-theme-samples/palettes.json"), "utf8"));
  const output = path.join(root, "output/playwright/light-themes");
  await mkdir(output, { recursive: true });
  const font = await readFile(path.join(root, "assets/brand/source/fonts/Manrope-wght-latin.woff2"));
  const fontCss = `@font-face{font-family:GHPreviewManrope;src:url(data:font/woff2;base64,${font.toString("base64")}) format('woff2');font-weight:200 800;font-display:swap;}`;
  const captures = [];
  const failures = [];
  for (const palette of palettes) {
    const item = { id: palette.id };
    for (const [device, viewport] of Object.entries({ desktop: { width: 1440, height: 1000 }, mobile: { width: 390, height: 844 } })) {
      await page.setViewportSize(viewport);
      await page.goto(`${url.origin}/?theme=${palette.id}`, { waitUntil: "networkidle" });
      await page.locator(`[data-review-theme="${palette.id}"] [data-fixture-id]`).first().waitFor();
      await page.waitForFunction((desktop) => {
        const fields = [...document.querySelectorAll("input")];
        return desktop ? fields.some((field) => field.getBoundingClientRect().width > 0) : true;
      }, device === "desktop");
      await page.evaluate(() => document.fonts.ready);
      const capture = await page.evaluate(() => {
        function flatten(rules) {
          return [...rules].map((rule) => {
            if (rule.type === CSSRule.MEDIA_RULE) return matchMedia(rule.conditionText).matches ? flatten(rule.cssRules) : "";
            if (rule.type === CSSRule.IMPORT_RULE) return rule.styleSheet ? flatten(rule.styleSheet.cssRules) : "";
            return rule.cssText;
          }).join("\n");
        }
        const css = [...document.styleSheets].map((sheet) => {
          try { return flatten(sheet.cssRules); } catch { return ""; }
        }).join("\n");
        const clone = document.body.cloneNode(true);
        clone.querySelectorAll("script,style,link,nextjs-portal,next-route-announcer,[data-review-additional-samples] script").forEach((node) => node.remove());
        clone.querySelectorAll("a").forEach((anchor) => { anchor.removeAttribute("href"); anchor.removeAttribute("target"); });
        clone.querySelectorAll("form").forEach((form) => form.removeAttribute("action"));
        clone.querySelectorAll("img").forEach((img) => { img.removeAttribute("srcset"); img.removeAttribute("loading"); });
        const inherited = getComputedStyle(document.body);
        return {
          html: `<div class="gh-capture-body" style="--font-manrope:GHPreviewManrope;font-family:GHPreviewManrope,Arial,sans-serif;font-size:${inherited.fontSize};line-height:${inherited.lineHeight};font-weight:${inherited.fontWeight};color:${inherited.color};background:${inherited.backgroundColor}">${clone.innerHTML}</div>`,
          css,
          font: "GHPreviewManrope, Arial, sans-serif",
          assets: [...new Set([...clone.querySelectorAll("img[src]")].map((img) => img.getAttribute("src")))],
          overflow: document.documentElement.scrollWidth > innerWidth,
          cards: document.querySelectorAll("[data-fixture-id]").length,
          theme: document.querySelector("[data-review-theme]")?.getAttribute("data-review-theme"),
        };
      });
      for (const src of capture.assets) {
        const assetUrl = new URL(src, url.origin);
        if (assetUrl.origin !== url.origin || !/^\/(brand|flags)\//.test(assetUrl.pathname)) continue;
        const asset = path.resolve(root, "public", `.${decodeURIComponent(assetUrl.pathname)}`);
        const publicRoot = path.resolve(root, "public") + path.sep;
        if (!asset.startsWith(publicRoot)) throw new Error("Asset escapes public directory.");
        const bytes = await readFile(asset);
        const type = asset.endsWith(".svg") ? "image/svg+xml" : asset.endsWith(".png") ? "image/png" : "image/jpeg";
        capture.html = capture.html.split(src).join(`data:${type};base64,${bytes.toString("base64")}`);
      }
      capture.css = fontCss + "\n" + capture.css;
      delete capture.assets;
      if (capture.overflow || capture.cards !== 7 || capture.theme !== palette.id) failures.push({ id: palette.id, device, ...capture, html: undefined, css: undefined });
      await page.screenshot({ path: path.join(output, `${palette.id}-${device}.png`), fullPage: false, animations: "disabled" });
      item[device] = capture;
    }
    captures.push(item);
  }
  await writeFile(path.join(output, "capture.json"), JSON.stringify({ themes: captures }));
  const report = { themes: captures.length, screens: captures.length * 2, failures };
  await writeFile(path.join(output, "verification.json"), JSON.stringify(report, null, 2));
  if (failures.length) throw new Error(`Preview verification failed: ${JSON.stringify(failures)}`);
  return report;
}
