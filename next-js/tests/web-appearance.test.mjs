import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";
import { webAppearance } from "../src/styles/web-appearance.ts";

registerHooks({
  load(url, context, nextLoad) {
    return nextLoad(url, url.startsWith("file:") && url.endsWith(".json")
      ? { ...context, importAttributes: { ...context.importAttributes, type: "json" } } : context);
  },
});
const { lightTheme, darkTheme } = await import("../src/styles/theme.ts");

test("native appearance is the exact public projection of the selected web theme", () => {
  for (const theme of [lightTheme, darkTheme]) {
    const value = webAppearance(theme);
    assert.deepEqual(value, {
      version: 1, scheme: theme.mode, background: theme.color.page, surface: theme.color.surface,
      foreground: theme.color.text, accent: theme.color.brand, chrome: theme.header.background,
    });
    assert.equal(JSON.stringify(value).length < 1024, true);
    for (const key of ["background", "surface", "foreground", "accent", "chrome"]) {
      assert.match(value[key], /^#[a-f\d]{6}$/iu);
    }
    assert.equal(Object.keys(value).length, 7);
  }
  assert.notDeepEqual(webAppearance(lightTheme), webAppearance(darkTheme));
});
