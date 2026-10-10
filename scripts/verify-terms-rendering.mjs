import assert from 'node:assert/strict';
import { termsNotice } from '../src/domain/terms-notice.ts';

// Inspect the actual production response without live provider/model calls.
const origin = new URL(process.argv[2] ?? 'http://127.0.0.1:3106');
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname), 'Use a local acceptance server.');
const sections = ['service', 'estimates', 'updates', 'outcomes', 'use', 'sources', 'privacy', 'release'];
const policyLinks = ['/en/how-it-works#probabilities', '/en/how-it-works#evidence', '/en/how-it-works#performance',
  '/en/how-it-works#schedule', '/en/how-it-works#settlement', '/en/how-it-works#corrections', '/en/privacy'];
const visibleHtml = html => html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/g, '');
for (const path of ['/en/terms', '/en/terms?q=%3Cscript%3Euntrusted-query%3C%2Fscript%3E']) {
  const response = await fetch(new URL(path, origin), { signal: AbortSignal.timeout(20_000) });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('set-cookie'), null);
  const html = await response.text(), visible = visibleHtml(html);
  assert.match(html, /<html[^>]*lang="en"/);
  assert.match(html, /<title>Terms of use \| Goal Hint<\/title>/);
  assert.match(html, /rel="canonical" href="https:\/\/goalhint.com\/en\/terms"/);
  assert.match(html, /name="robots" content="noindex, follow"/);
  assert.ok(html.indexOf('data-styled=') < html.indexOf('<header'), 'Initial shell CSS');
  assert.equal((visible.match(/<main[\s>]/g) ?? []).length, 1);
  assert.equal((visible.match(/<h1[\s>]/g) ?? []).length, 1);
  const ids = [...visible.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(ids.length, new Set(ids).size, 'Unique semantic anchors');
  for (const id of sections) {
    assert.ok(visible.includes(`href="#terms-${id}"`));
    assert.ok(visible.includes(`id="terms-${id}"`));
    assert.ok(visible.includes(`aria-labelledby="terms-${id}-heading"`));
  }
  assert.ok(visible.includes(`data-terms-status="${termsNotice.publication}"`));
  assert.match(visible, /data-terms-release-ready="false"/);
  assert.match(visible, /not completed, effective terms of use/);
  assert.match(visible, /public release remain blocked/);
  assert.ok(new RegExp(`datetime="${termsNotice.reviewedOn}"`, 'i').test(visible));
  assert.match(visible, /not legal approval or an effective date/);
  assert.match(visible, /does not offer betting, accept stakes, process payments or sell visitor subscriptions/);
  assert.match(visible, /does not guarantee wins, prediction accuracy/);
  assert.match(visible, /Public correction and dispute submissions are not yet available/);
  assert.match(visible, /draft grants no content licence/);
  assert.equal((visible.match(/aria-current="page"/g) ?? []).length, 1);
  assert.ok([...visible.matchAll(/<a\b[^>]*>/g)].some(([tag]) => tag.includes('href="/en/terms"') && tag.includes('aria-current="page"')));
  for (const link of policyLinks) assert.ok(visible.includes(`href="${link}"`), link);
  assert.doesNotMatch(visible, /TODO|TBD|Lorem ipsum|example\.com|mailto:|untrusted-query|\{date\}/i);
  assert.doesNotMatch(visible, /<form|<iframe|<input/i);
  console.log(`PASS initial production terms HTML: ${path}`);
}
const documents = new Map();
for (const link of policyLinks) {
  const target = new URL(link, origin);
  if (!documents.has(target.pathname)) {
    const response = await fetch(new URL(target.pathname, origin), { signal: AbortSignal.timeout(20_000) });
    assert.equal(response.status, 200, `Published destination: ${link}`);
    documents.set(target.pathname, visibleHtml(await response.text()));
  }
  if (target.hash) assert.ok(documents.get(target.pathname).includes(`id="${target.hash.slice(1)}"`), `Existing section: ${link}`);
}
console.log('PASS actual methodology, performance, settlement/correction anchors and privacy destination.');
