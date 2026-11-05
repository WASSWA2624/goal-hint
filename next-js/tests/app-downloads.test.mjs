import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { appDownloadsHref, appPromptCooldown, appReleaseKey, checkedPlayStoreUrl, detectAppPlatform, nativeAppIdentity, isNewerAppRelease, shouldOfferAppDownload } from '../src/domain/app-downloads.ts';
import { appVersionSchema } from '../src/domain/app-downloads.ts';
import * as presentation from '../src/domain/app-download-presentation.ts';
import { getAppDownloads, readAppFileReleases } from '../src/server/downloads/catalog.ts';
import { appDownloadResponse } from '../src/server/downloads/file-response.ts';

const release = { platform: 'windows', version: '1.2.3', build: 7, kind: 'file', href: '/api/downloads/windows', size: 10, sha256: 'a'.repeat(64) };
const native = { platform: 'windows', channel: 'development', version: '1.2.3', build: 6 };
test('download links use the canonical locale route independently of the Matches home page', () => {
  for (const locale of ['en', 'fr', '', 'en/../privacy']) {
    assert.equal(presentation.appDownloadsHref(locale), '/en/download');
    assert.equal(appDownloadsHref(locale), '/en/download');
  }
});
test('browser presentation preserves catalog version validation and compatibility exports', () => {
  assert.equal(nativeAppIdentity, presentation.nativeAppIdentity);
  assert.equal(shouldOfferAppDownload, presentation.shouldOfferAppDownload);
  for (const version of ['1.2.3', '0.0.0', '01.002.3', '999999999999.0.1', '', '1.2', '1.2.3.4',
    'v1.2.3', '1.2.3-beta', ' 1.2.3', '1.2.3 ', '1.2.3\n', '-1.2.3', 'one.two.three']) {
    assert.equal(presentation.appVersionPattern.test(version), appVersionSchema.safeParse(version).success, version);
  }
});
test('detect OS independently of viewport size, without guessing unsupported platforms', () => {
  assert.equal(detectAppPlatform('Mozilla/5.0 (Linux; Android 16)'), 'android');
  assert.equal(detectAppPlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64)'), 'windows');
  for (const agent of ['iPhone', 'Macintosh', 'Linux x86_64', '']) assert.equal(detectAppPlatform(agent), null);
  assert.deepEqual(nativeAppIdentity('Mozilla GoalHintNative/windows/1.2.3/6/development'), native);
  assert.equal(nativeAppIdentity('GoalHintNative/windows/1.2.3/NaN/development'), null);
});
test('only newer native releases trigger updates, including build increments and rollbacks', () => {
  assert.equal(isNewerAppRelease(release, native), true);
  assert.equal(isNewerAppRelease({ version: '1.10.0', build: 1 }, { version: '1.9.9', build: 99 }), true);
  assert.equal(isNewerAppRelease({ version: '1.1.0', build: 99 }, native), false);
  assert.equal(shouldOfferAppDownload('development', release, {}, 100, { ...native, build: 7 }), false);
  assert.equal(shouldOfferAppDownload('production', release, {}, 100, native), false);
  assert.equal(shouldOfferAppDownload('development', release, {}, 100, nativeAppIdentity('GoalHintNative/windows/unknown/0/development')), false);
});
test('remember download requests per release and retain dismissals for a week', () => {
  const key = appReleaseKey('development', release);
  assert.equal(shouldOfferAppDownload('development', release, {}, 100, null), true);
  assert.equal(shouldOfferAppDownload('development', release, { acknowledged: key }, 100, null), false);
  assert.equal(shouldOfferAppDownload('development', release, { dismissed: key, dismissedAt: 100 }, 101, null), false);
  assert.equal(shouldOfferAppDownload('development', release, { dismissed: key, dismissedAt: 100 }, 100 + appPromptCooldown, null), true);
  assert.equal(shouldOfferAppDownload('development', { ...release, build: 8 }, { acknowledged: key }, 100, null), true);
  assert.equal(shouldOfferAppDownload('development', { ...release, build: 5 }, { acknowledged: key }, 100, null), false);
});
test('production store links accept only actual HTTPS Google Play app listings', () => {
  assert.equal(checkedPlayStoreUrl(''), null);
  assert.equal(checkedPlayStoreUrl('https://play.google.com/store/apps/details?id=com.example.app'), 'https://play.google.com/store/apps/details?id=com.example.app');
  for (const value of ['https://example.com/app', 'https://play.google.com.evil.test/store/apps/details?id=a', 'http://play.google.com/store/apps/details?id=a', 'https://play.google.com/store/apps/details', 'javascript:alert(1)']) assert.equal(checkedPlayStoreUrl(value), null);
});
test('file streams resume, reject bad ranges and never expose development files in production', async () => {
  const keys = ['GOAL_HINT_APP_DOWNLOADS_ROOT', 'GOAL_HINT_DEPLOYMENT_ENVIRONMENT', 'GOAL_HINT_ANDROID_PLAY_STORE_URL', 'GOAL_HINT_ANDROID_PLAY_STORE_VERSION', 'GOAL_HINT_ANDROID_PLAY_STORE_BUILD'];
  const before = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const root = await mkdtemp(path.join(tmpdir(), 'goal-hint-download-test-'));
  try {
    process.env.GOAL_HINT_APP_DOWNLOADS_ROOT = root;
    process.env.GOAL_HINT_DEPLOYMENT_ENVIRONMENT = 'development';
    process.env.GOAL_HINT_ANDROID_PLAY_STORE_URL = '';
    const file = { platform: 'windows', version: '1.2.3', build: 7, fileName: 'Setup.exe', size: 10, sha256: 'a'.repeat(64) };
    await mkdir(path.join(root, 'files/windows/1.2.3-7'), { recursive: true });
    await writeFile(path.join(root, 'files/windows/1.2.3-7/Setup.exe'), '0123456789');
    await writeFile(path.join(root, 'catalog.json'), JSON.stringify({ schema: 1, channel: 'development', releases: [file] }));
    const request = (headers = {}, method = 'GET', query = '?version=1.2.3&build=7') => new Request('http://localhost/api/downloads/windows' + query, { headers, method });
    assert.equal((await getAppDownloads()).releases.length, 1);
    assert.equal(await (await appDownloadResponse(request(), 'windows')).text(), '0123456789');
    const partial = await appDownloadResponse(request({ range: 'bytes=2-5' }), 'windows');
    assert.equal(partial.status, 206); assert.equal(partial.headers.get('content-range'), 'bytes 2-5/10'); assert.equal(await partial.text(), '2345');
    assert.equal(await (await appDownloadResponse(request({ range: 'bytes=-3' }), 'windows')).text(), '789');
    for (const range of ['bytes=10-', 'bytes=5-2', 'bytes=0-2,4-5', 'bytes=-0']) assert.equal((await appDownloadResponse(request({ range }), 'windows')).status, 416);
    const head = await appDownloadResponse(request({}, 'HEAD'), 'windows'); assert.equal(head.headers.get('content-length'), '10'); assert.equal(await head.text(), '');
    assert.equal((await appDownloadResponse(request({}, 'GET', '?version=1.2.3&build=6'), 'windows')).status, 409);
    process.env.GOAL_HINT_DEPLOYMENT_ENVIRONMENT = 'production';
    assert.deepEqual(await readAppFileReleases(), []);
    assert.equal((await getAppDownloads()).releases.length, 0);
    process.env.GOAL_HINT_ANDROID_PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.example.app';
    const store = (await getAppDownloads()).releases[0]; assert.equal(store.kind, 'store'); assert.equal(store.version, null);
    process.env.GOAL_HINT_ANDROID_PLAY_STORE_VERSION = '2.0.0'; process.env.GOAL_HINT_ANDROID_PLAY_STORE_BUILD = '20';
    assert.equal((await getAppDownloads()).releases[0].build, 20);
  } finally {
    for (const key of keys) if (before[key] === undefined) delete process.env[key]; else process.env[key] = before[key];
    await rm(root, { recursive: true, force: true });
  }
});
