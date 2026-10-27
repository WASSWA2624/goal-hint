import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";
import { marketSelections } from "../src/domain/markets.ts";

// theme.ts imports the brand tokens JSON the bundler way (no import attribute); add it for Node.
registerHooks({
  load(url, context, nextLoad) {
    if (url.startsWith("file:") && url.endsWith(".json")) {
      return nextLoad(url, { ...context, importAttributes: { ...context.importAttributes, type: "json" } });
    }
    return nextLoad(url, context);
  },
});
const { lightTheme, darkTheme } = await import("../src/styles/theme.ts");

const channel = (value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
const luminance = (hex) => {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  assert.ok(match, `${hex} is a 6-digit hex colour`);
  const [r, g, b] = match.slice(1).map((pair) => channel(Number.parseInt(pair, 16) / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (first, second) => {
  const [light, dark] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
};
const SMALL_TEXT = 4.5;

/** Every stop must be a plain hex colour, so no stop can slip past the parser. */
const gradientStops = (gradient) => {
  if (/^#[0-9a-f]{6}$/i.test(gradient)) return [gradient];
  assert.match(gradient, /^linear-gradient\(\d+deg(, #[0-9a-f]{6} \d+%){2,}\)$/i, `${gradient} uses hex stops only`);
  return gradient.match(/#[0-9a-f]{6}/gi);
};

test("every market family has colours", () => {
  for (const theme of [lightTheme, darkTheme]) {
    assert.deepEqual(Object.keys(theme.color.market).sort(), Object.keys(marketSelections).sort());
  }
});

test("Porcelain Blue uses flat market accents and restrained light tints", () => {
  for (const [family, colours] of Object.entries(lightTheme.color.market)) {
    assert.equal(colours.gradient, colours.solid, `${family} keeps the approved flat accent`);
    assert.ok(luminance(colours.soft) >= 0.85, `${family} soft fill should stay close to the white card surface`);
  }
});

test("market colours keep small text at 4.5:1 or better", () => {
  for (const theme of [lightTheme, darkTheme]) {
    const ink = theme.color.onBrand;
    const surface = theme.color.surface;
    for (const [family, colours] of Object.entries(theme.color.market)) {
      const pairs = [
        ["icon on solid", ink, colours.solid],
        ...gradientStops(colours.gradient).map((stop, index) => [`icon on gradient stop ${index + 1}`, ink, stop]),
        ["text on soft", colours.text, colours.soft],
        ["text on surface", colours.text, surface],
      ];
      for (const [label, foreground, background] of pairs) {
        const ratio = contrast(foreground, background);
        assert.ok(ratio >= SMALL_TEXT, `${theme.mode} ${family}: ${label} (${foreground} on ${background}) is ${ratio.toFixed(2)}:1`);
      }
    }
  }
});
