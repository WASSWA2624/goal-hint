import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { hasBrowserPrivacySignal, resolveAnalyticsConsent } from '../src/domain/analytics-consent.ts';
import { analyticsRules } from '../src/domain/analytics-settings.ts';
import { consentBootstrapScript } from '../src/server/analytics/consent-bootstrap.ts';

const now = 1_000_000_000_000, valid = { v: 1, choice: 'granted', at: now - 1000 };

test('the initial and hydrated consent paths share expiry, validation and signal precedence', () => {
  const cases = [
    { stored: null, expected: 'unset' },
    { stored: valid, expected: 'granted' },
    { stored: { ...valid, choice: 'denied' }, expected: 'denied' },
    { stored: { ...valid, at: now - analyticsRules.consentMaxAgeMs - 1 }, expected: 'unset' },
    { stored: { ...valid, at: undefined }, expected: 'unset' },
    { stored: { ...valid, v: 2 }, expected: 'unset' },
    { stored: valid, signal: true, expected: 'signal' },
    { stored: valid, automated: true, signal: true, expected: 'automation' },
  ];
  for (const scenario of cases) {
    assert.equal(resolveAnalyticsConsent({ now, maxAgeMs: analyticsRules.consentMaxAgeMs, automated: false, signal: false, ...scenario }), scenario.expected);
    const rules = ['section[data-consent-pending]{display:none}'];
    const sheet = { cssRules: rules, insertRule: (rule, index) => rules.splice(index, 0, rule) };
    const browser = { webdriver: scenario.automated ?? false, globalPrivacyControl: scenario.signal ?? false };
    vm.runInNewContext(consentBootstrapScript(), {
      navigator: browser, window: {}, Date: { now: () => now },
      document: { getElementById: () => ({ sheet }) },
      localStorage: { getItem: () => JSON.stringify(scenario.stored), setItem: () => assert.fail('No pre-consent storage write') },
      fetch: () => assert.fail('No pre-consent network request'),
    });
    assert.equal(rules.length, scenario.expected === 'unset' ? 2 : 1, scenario.expected);
  }
});

test('all supported browser privacy signals suppress consent prompts', () => {
  for (const browser of [{ globalPrivacyControl: true }, { doNotTrack: '1' }, { msDoNotTrack: '1' }]) {
    assert.equal(hasBrowserPrivacySignal(browser, {}), true);
  }
  assert.equal(hasBrowserPrivacySignal({}, { doNotTrack: '1' }), true);
  assert.equal(hasBrowserPrivacySignal({ doNotTrack: '0' }, {}), false);
});

test('blocked or malformed storage still permits a choice without storing or collecting', () => {
  for (const read of [() => { throw new Error('blocked'); }, () => '{malformed']) {
    const rules = [], sheet = { cssRules: rules, insertRule: rule => rules.push(rule) };
    vm.runInNewContext(consentBootstrapScript(), { navigator: {}, window: {}, Date: { now: () => now },
      document: { getElementById: () => ({ sheet }) }, localStorage: { getItem: read } });
    assert.equal(rules.length, 1);
  }
});
