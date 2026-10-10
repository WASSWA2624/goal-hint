import assert from 'node:assert/strict';
import { privacyNotice } from '../src/domain/privacy-notice.ts';

// Verify a local production build without database access or live provider calls.
const origin = new URL(process.argv[2] ?? 'http://127.0.0.1:3106');
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname), 'Use a local acceptance server.');
const sections = ['access', 'requests', 'search', 'storage', 'tracking', 'images', 'football', 'retention', 'choices', 'release'];
for (const path of ['/en/privacy', '/en/privacy?q=%3Cscript%3Euntrusted-query%3C%2Fscript%3E']) {
  const response = await fetch(new URL(path, origin), { signal: AbortSignal.timeout(20_000) });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('set-cookie'), null);
  const html = await response.text(), visible = html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/g, '');
  assert.match(html, /<html[^>]*lang="en"/);
  assert.match(html, /<title>Privacy and data handling \| Goal Hint<\/title>/);
  assert.match(html, /rel="canonical" href="https:\/\/goalhint.com\/en\/privacy"/);
  assert.match(html, /name="robots" content="noindex, follow"/);
  assert.ok(html.indexOf('data-styled=') < html.indexOf('<header'), 'Initial styled-components CSS');
  assert.equal((visible.match(/<main[\s>]/g) ?? []).length, 1);
  assert.equal((visible.match(/<h1[\s>]/g) ?? []).length, 1);
  const ids = [...visible.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(ids.length, new Set(ids).size, 'Unique anchors');
  for (const id of sections) {
    assert.ok(visible.includes(`href="#privacy-${id}"`));
    assert.ok(visible.includes(`id="privacy-${id}"`));
    assert.ok(visible.includes(`aria-labelledby="privacy-${id}-heading"`));
  }
  assert.ok(visible.includes(`data-privacy-status="${privacyNotice.publication}"`));
  assert.match(visible, /data-privacy-release-ready="false"/);
  assert.match(visible, /not a completed, effective privacy notice/);
  assert.ok(new RegExp(`datetime="${privacyNotice.reviewedOn}"`, 'i').test(visible));
  assert.match(visible, /not a legal approval or an effective date/);
  assert.match(visible, /cached pagination links can contain your search text/);
  assert.match(visible, /not necessarily erased at that exact time/);
  assert.match(visible, /An owner-approved public privacy contact.*not yet available/);
  assert.match(visible, /your browser requests them directly from the remote image host/);
  assert.match(visible, /Current responses can be reused for up to 5 seconds.*up to 6 hours/);
  assert.match(visible, /At most 20 navigation records.*older than 30 minutes/);
  assert.equal((visible.match(/aria-current="page"/g) ?? []).length, 1);
  assert.ok([...visible.matchAll(/<a\b[^>]*>/g)].some(([tag]) => tag.includes('href="/en/privacy"') && tag.includes('aria-current="page"')));
  assert.match(visible, /href="\/en\/how-it-works"/);
  assert.doesNotMatch(visible, /TODO|TBD|Lorem ipsum|example\.com|mailto:|untrusted-query|\{(?:date|minutes|seconds|hours|entries)\}/i);
  assert.doesNotMatch(visible, /<form|<iframe|<input/i);
  console.log(`PASS production privacy HTML: ${path}`);
}
console.log('PASS initial privacy content, honest publication gate, review date, storage/cache disclosures, navigation and anonymous metadata.');
