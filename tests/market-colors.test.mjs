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
const { lightTheme } = await import("../src/styles/theme.ts");

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
  assert.match(gradient, /^linear-gradient\(\d+deg(, #[0-9a-f]{6} \d+%){2,}\)$/i, `${gradient} uses hex stops only`);
  return gradient.match(/#[0-9a-f]{6}/gi);
};

test("every market family has colours", () => {
  assert.deepEqual(Object.keys(lightTheme.color.market).sort(), Object.keys(marketSelections).sort());
});

test("market colours keep small text at 4.5:1 or better", () => {
  const white = lightTheme.color.onBrand;
  const surface = lightTheme.color.surface;
  assert.equal(luminance(white), 1);
  assert.equal(luminance(surface), 1);
  for (const [family, colours] of Object.entries(lightTheme.color.market)) {
    const pairs = [
      ["white on solid", white, colours.solid],
      // Luminance is convex in sRGB values, so a blend between stops is never lighter than its lighter end: the
      // stops bound white text across the whole gradient.
      ...gradientStops(colours.gradient).map((stop, index) => [`white on gradient stop ${index + 1}`, white, stop]),
      ["text on soft", colours.text, colours.soft],
      ["text on white", colours.text, surface],
    ];
    for (const [label, foreground, background] of pairs) {
      const ratio = contrast(foreground, background);
      assert.ok(ratio >= SMALL_TEXT, `${family}: ${label} (${foreground} on ${background}) is ${ratio.toFixed(2)}:1`);
    }
  }
});
