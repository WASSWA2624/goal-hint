import assert from 'node:assert/strict';
import test from 'node:test';
import { androidAppLinkAssociation, androidAppLinkFingerprints, iosAppLinkAssociation } from '../src/domain/slip-app-links.ts';
import { slipAppLinkResponse } from '../src/server/slips/slip-app-links.ts';
import { parseRuntimePolicy } from '../src/server/config/runtime-policy.ts';

const first = Array(32).fill('AB').join(':');
const second = Array(32).fill('CD').join(':');

test('association setup fails closed for absent, partial, malformed or unbounded signing inputs', () => {
  for (const value of [undefined, '', ' ', 'AB:CD', `${first},invalid`, Array(18).fill(first).join(',')]) {
    assert.deepEqual(androidAppLinkAssociation(value), []);
  }
  for (const value of [undefined, '', 'team', 'ABCDEFGHIJK', 'abcdefghij', 'TEAMID1234.bad']) {
    assert.deepEqual(iosAppLinkAssociation(value), { applinks: { apps: [], details: [] } });
  }
});

test('Android association publishes only known package and normalized, deduplicated release fingerprints', () => {
  assert.deepEqual(androidAppLinkFingerprints(` ${first.toLowerCase()}, ${second}, ${first} `), [first, second]);
  assert.deepEqual(androidAppLinkAssociation(first), [{
    relation: ['delegate_permission/common.handle_all_urls'],
    target: { namespace: 'android_app', package_name: 'com.goalhint.goal_hint', sha256_cert_fingerprints: [first] },
  }]);
});

test('iOS association binds the actual bundle and only shared slip paths', () => {
  assert.deepEqual(iosAppLinkAssociation('TEAMID1234'), { applinks: { apps: [], details: [{
    appIDs: ['TEAMID1234.com.goalhint.goalHint'], components: [{ '/': '/s/*' }],
  }] } });
});

test('public association responses are JSON with bounded caching and no cookies', async () => {
  for (const platform of ['android', 'ios']) {
    const response = slipAppLinkResponse(platform, {});
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /^application\/json/);
    assert.equal(response.headers.get('cache-control'), 'public, max-age=300');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('set-cookie'), null);
  }
  assert.deepEqual(await slipAppLinkResponse('android', { GOAL_HINT_ANDROID_APP_LINK_SHA256: first }).json(), androidAppLinkAssociation(first));
});

test('documented app link settings are accepted by central runtime configuration and malformed values are rejected', () => {
  assert.doesNotThrow(() => parseRuntimePolicy({ GOAL_HINT_ANDROID_APP_LINK_SHA256: first, GOAL_HINT_IOS_APP_LINK_TEAM_ID: 'TEAMID1234' }));
  assert.doesNotThrow(() => parseRuntimePolicy({ GOAL_HINT_ANDROID_APP_LINK_SHA256: '', GOAL_HINT_IOS_APP_LINK_TEAM_ID: '' }));
  assert.throws(() => parseRuntimePolicy({ GOAL_HINT_ANDROID_APP_LINK_SHA256: 'not-a-fingerprint' }));
  assert.throws(() => parseRuntimePolicy({ GOAL_HINT_IOS_APP_LINK_TEAM_ID: 'not-a-team' }));
});
