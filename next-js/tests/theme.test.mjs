import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";
import {
  getServerThemeSnapshot, getThemeSnapshot, resolveThemeMode, setThemePreference,
  storedThemeMode, subscribeThemePreference, themeStorageKey,
} from "../src/styles/theme-preference.ts";

registerHooks({
  load(url, context, nextLoad) {
    if (url.startsWith("file:") && url.endsWith(".json")) {
      return nextLoad(url, { ...context, importAttributes: { ...context.importAttributes, type: "json" } });
    }
    return nextLoad(url, context);
  },
});
const { darkTheme, lightTheme } = await import("../src/styles/theme.ts");

const luminance = (hex) => {
  assert.match(hex, /^#[0-9a-f]{6}$/i);
  const channels = [1, 3, 5].map((offset) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
};
const readable = (foreground, background, label, minimum = 4.5) => {
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  const ratio = (light + 0.05) / (dark + 0.05);
  assert.ok(ratio >= minimum, `${label}: ${foreground} on ${background} is ${ratio.toFixed(2)}:1`);
};

test("both themes keep body, controls, captions and outcome text readable", () => {
  for (const theme of [lightTheme, darkTheme]) {
    for (const background of [theme.color.surface, theme.color.surfaceMuted, theme.color.page]) {
      readable(theme.color.text, background, `${theme.mode} body`);
      readable(theme.color.mutedText, background, `${theme.mode} captions`);
      readable(theme.color.link, background, `${theme.mode} links`);
      readable(theme.color.controlBorder, background, `${theme.mode} control boundaries`, 3);
    }
    readable(theme.color.onBrand, theme.color.brand, `${theme.mode} primary actions`);
    for (const background of [theme.gradient.action, theme.gradient.actionHover]) {
      readable(theme.color.onAction, background, `${theme.mode} blue primary actions`);
    }
    for (const background of theme.gradient.tableHeader.match(/#[0-9a-f]{6}/gi)) {
      readable(theme.header.text, background, `${theme.mode} desktop table headings`);
    }
    for (const background of [theme.header.background, theme.header.controlFill, theme.header.controlHover]) {
      readable(theme.header.text, background, `${theme.mode} title bar`);
      readable(theme.header.accent, background, `${theme.mode} current navigation`);
    }
    readable(theme.header.onAccent, theme.header.accent, `${theme.mode} selected header controls`);
    for (const background of [theme.header.fieldFill, theme.header.fieldFillActive]) {
      readable(theme.header.text, background, `${theme.mode} header input`);
      readable(theme.header.placeholder, background, `${theme.mode} header placeholder`);
    }
    for (const background of theme.header.navigationBackground.match(/#[0-9a-f]{6}/gi)) {
      readable(theme.header.mutedText, background, `${theme.mode} navigation`);
      readable(theme.header.accent, background, `${theme.mode} active navigation`);
    }
    for (const [outcome, colors] of Object.entries(theme.color.outcome)) {
      readable(colors.text, colors.background, `${theme.mode} ${outcome}`);
      readable(colors.text, theme.color.surface, `${theme.mode} inline ${outcome}`);
    }
    for (const [verdict, colors] of Object.entries(theme.color.verdict)) {
      readable(colors.text, colors.fill, `${theme.mode} ${verdict} verdict`);
    }
    for (const [accent, colors] of Object.entries(theme.color.accent)) {
      readable(colors.text, colors.soft, `${theme.mode} ${accent} caption`);
    }
  }
});

test("page, cards, navigation and table chrome share the selected theme", () => {
  for (const theme of [lightTheme, darkTheme]) {
    for (const color of [theme.color.page, theme.color.surface, theme.color.surfaceMuted,
      theme.color.cardHeader, theme.gradient.page, theme.gradient.tableHeader,
      theme.header.background, theme.header.gradient, theme.header.navigationBackground]) {
      const brightness = luminance(color);
      assert.ok(theme.mode === "light" ? brightness >= 0.85 : brightness <= 0.08,
        `${theme.mode} neutral surface ${color} belongs to the selected palette`);
    }
    assert.equal(theme.phoneCardFrame.radius, "0");
    assert.equal(theme.phoneCardFrame.shadow, "none");
    readable(theme.phoneCardFrame.border, theme.color.surface, `${theme.mode} phone card frame`, 3);
  }
  assert.equal(lightTheme.color.page, "#FFFFFF");
  assert.equal(lightTheme.color.surface, "#FFFFFF");
  for (const colors of Object.values(darkTheme.color.verdict)) {
    assert.ok(luminance(colors.fill) <= 0.08, "Dark result badges must not inherit light fills");
  }
});

test("saved preferences are strict and take precedence over the operating system", () => {
  assert.equal(storedThemeMode("dark"), "dark");
  assert.equal(storedThemeMode("LIGHT"), null);
  assert.equal(resolveThemeMode("light", true), "light");
  assert.equal(resolveThemeMode("dark", false), "dark");
  assert.equal(resolveThemeMode("obsolete", true), "dark");
  assert.equal(resolveThemeMode(null, false), "light");
  assert.equal(getServerThemeSnapshot(), "light");
});

function browser(t, { saved = null, dark = false, blocked = false, writeBlocked = false } = {}) {
  const values = new Map(saved === null ? [] : [[themeStorageKey, saved]]);
  const events = new Map();
  const mediaEvents = new Map();
  const media = {
    matches: dark,
    addEventListener: (name, listener) => mediaEvents.set(name, listener),
    removeEventListener: (name) => mediaEvents.delete(name),
  };
  const previous = globalThis.window;
  globalThis.window = {
    localStorage: {
      getItem: (key) => { if (blocked) throw new Error("Storage blocked"); return values.get(key) ?? null; },
      setItem: (key, value) => { if (blocked || writeBlocked) throw new Error("Storage blocked"); values.set(key, value); },
    },
    matchMedia: () => media,
    addEventListener: (name, listener) => events.set(name, listener),
    removeEventListener: (name) => events.delete(name),
  };
  t.after(() => { if (previous === undefined) delete globalThis.window; else globalThis.window = previous; });
  return { values, events, mediaEvents, media };
}

test("toggling persists, notifies subscribers and synchronizes other tabs", (t) => {
  const state = browser(t, { saved: "light", dark: true });
  let notifications = 0;
  const unsubscribe = subscribeThemePreference(() => { notifications += 1; });
  t.after(unsubscribe);
  assert.equal(getThemeSnapshot(), "light");
  setThemePreference("dark");
  assert.equal(state.values.get(themeStorageKey), "dark");
  assert.equal(getThemeSnapshot(), "dark");
  assert.equal(notifications, 1);
  state.values.set(themeStorageKey, "light");
  state.events.get("storage")({ key: themeStorageKey });
  assert.equal(getThemeSnapshot(), "light");
  assert.equal(notifications, 2);
  state.events.get("storage")({ key: "unrelated" });
  assert.equal(notifications, 2);
  unsubscribe();
  assert.equal(state.events.size, 0);
  assert.equal(state.mediaEvents.size, 0);
});

test("a blocked storage setting still permits toggling without throwing", (t) => {
  browser(t, { blocked: true });
  assert.doesNotThrow(() => setThemePreference("dark"));
  assert.equal(getThemeSnapshot(), "dark");
  setThemePreference("light");
  assert.equal(getThemeSnapshot(), "light");
});

test("a full storage quota does not prevent changing an existing saved theme", (t) => {
  const state = browser(t, { saved: "light", writeBlocked: true });
  const unsubscribe = subscribeThemePreference(() => {});
  t.after(unsubscribe);
  state.events.get("storage")({ key: themeStorageKey });
  assert.equal(getThemeSnapshot(), "light");
  setThemePreference("dark");
  assert.equal(state.values.get(themeStorageKey), "light");
  assert.equal(getThemeSnapshot(), "dark");
});
