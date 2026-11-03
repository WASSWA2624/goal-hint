import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { cssColorTheme, themeCssVariables } from '../src/styles/theme-css.ts';
registerHooks({ load(url, context, next) {
  return next(url, url.endsWith('.json') ? { ...context, importAttributes: { ...context.importAttributes, type: 'json' } } : context);
} });
const { darkTheme, lightTheme } = await import('../src/styles/theme.ts');

test('unhydrated loading colors follow root variables while control geometry and breakpoints remain concrete', () => {
  const loading = cssColorTheme(lightTheme);
  for (const key of ['size', 'spacing', 'radius', 'breakpoint', 'viewport', 'control']) assert.deepEqual(loading[key], lightTheme[key]);
  for (const theme of [lightTheme, darkTheme]) {
    const css = themeCssVariables(theme);
    assert.equal(loading.color.surface, 'var(--gh-theme-color-surface)');
    assert.ok(css.includes(`--gh-theme-color-surface: ${theme.color.surface};`));
    assert.ok(css.includes(`--gh-theme-color-performanceOutcome-correct-background: ${theme.color.performanceOutcome.correct.background};`));
    assert.equal(loading.select.background, 'var(--gh-theme-select-background)', 'Select fallback colors must adapt before hydration too.');
    assert.ok(css.includes(`--gh-theme-select-background: ${theme.select.background};`));
  }
});
