import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({
  resolve(specifier, context, nextResolve) {
    return nextResolve(specifier.startsWith("@/styles/") ? new URL(`../src/${specifier.slice(2)}.ts`, import.meta.url).href : specifier, context);
  },
  load(url, context, nextLoad) {
    return nextLoad(url, url.endsWith(".json")
      ? { ...context, importAttributes: { ...context.importAttributes, type: "json" } } : context);
  },
});
const { desktopThemes, previewScreens } = await import("../design/desktop-themes/catalog.ts");
const { isGoalHintTheme, lightTheme, darkTheme } = await import("../src/styles/theme.ts");

test("the live application uses the exact approved Porcelain Blue and Cobalt Night review objects", () => {
  assert.strictEqual(lightTheme, desktopThemes.find(theme => theme.id === "porcelain-blue").theme);
  assert.strictEqual(darkTheme, desktopThemes.find(theme => theme.id === "cobalt-night").theme);
  assert.equal(lightTheme.mode, "light");
  assert.equal(darkTheme.mode, "dark");
});

function contrast(a, b) {
  const luminance = color => {
    const channels = [1, 3, 5].map(offset => {
      const value = Number.parseInt(color.slice(offset, offset + 2), 16) / 255;
      return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
    });
    return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
  };
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + .05) / (values[1] + .05);
}

test("all desktop directions provide the complete shared application theme contract", () => {
  assert.equal(desktopThemes.length, 10);
  assert.equal(new Set(desktopThemes.map(theme => theme.id)).size, 10);
  assert.equal(previewScreens.length, 12);
  for (const direction of desktopThemes) {
    assert.ok(isGoalHintTheme(direction.theme), `${direction.id}: incomplete application theme`);
    assert.equal(direction.theme.header.brandVariant, direction.palette.header === direction.palette.surface ? "primary" : "inverse");
  }
});

test("desktop palettes retain readable text, primary actions, header navigation, and field boundaries", () => {
  for (const { id, theme } of desktopThemes) {
    const readable = (text, surface, minimum, role) => assert.ok(contrast(text, surface) >= minimum, `${id}: ${role}`);
    for (const surface of [theme.color.surface, theme.color.surfaceMuted, theme.color.page]) {
      readable(theme.color.text, surface, 4.5, "body");
      readable(theme.color.mutedText, surface, 4.5, "secondary text");
      readable(theme.color.controlBorder, surface, 3, "editable field boundary");
    }
    readable(theme.color.onAction, theme.gradient.action, 4.5, "primary action");
    readable(theme.color.onAction, theme.gradient.actionHover, 4.5, "hovered primary action");
    readable(theme.color.brand, theme.color.brandSoft, 4.5, "selected control");
    readable(theme.header.mutedText, theme.header.desktopBackground, 4.5, "header navigation");
    readable(theme.header.onAccent, theme.header.accent, 4.5, "header action");
    readable(theme.color.selection.text, theme.color.selection.background, 4.5, "selected text");
  }
});
