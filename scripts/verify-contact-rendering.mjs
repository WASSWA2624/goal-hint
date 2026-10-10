import assert from 'node:assert/strict';
import { contactNotice } from '../src/domain/contact-notice.ts';

// Verify the actual local production response. Never contact an external recipient.
const origin = new URL(process.argv[2] ?? 'http://127.0.0.1:3106');
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname), 'Use a local acceptance server.');
const visibleHtml = html => html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/g, '');
const paths = ['/en/contact',
  '/en/contact?email=untrusted-query%40invalid.test&subject=%0D%0ABcc%3Auntrusted-query%40invalid.test',
  '/en/contact?body=%3Cscript%3Euntrusted-query%3C%2Fscript%3E&returnTo=javascript%3Auntrusted-query',
  '/en/contact?destination=https%3A%2F%2Finvalid.test%2Funtrusted-query&operator=untrusted-query'];
for (const path of paths) {
  const response = await fetch(new URL(path, origin), { signal: AbortSignal.timeout(20_000) });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('set-cookie'), null);
  const html = await response.text(), visible = visibleHtml(html);
  assert.match(html, /<html[^>]*lang="en"/);
  assert.match(html, /<title>Contact and corrections \| Goal Hint<\/title>/);
  assert.match(html, /rel="canonical" href="https:\/\/goalhint.com\/en\/contact"/);
  assert.match(html, /name="robots" content="noindex, follow"/);
  assert.ok(html.indexOf('data-styled=') < html.indexOf('<header'), 'Initial shell CSS');
  assert.equal((visible.match(/<main[\s>]/g) ?? []).length, 1);
  assert.equal((visible.match(/<h1[\s>]/g) ?? []).length, 1);
  const ids = [...visible.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(ids.length, new Set(ids).size, 'Unique semantic anchors');
  for (const section of ['report', 'corrections', 'policies']) {
    assert.ok(visible.includes(`id="contact-${section}"`));
    assert.ok(visible.includes(`aria-labelledby="contact-${section}-heading"`));
  }
  assert.ok(visible.includes(`data-contact-status="${contactNotice.publication}"`));
  assert.match(visible, /data-contact-release-ready="false"/);
  assert.match(visible, /Public contact is not yet available/);
  assert.match(visible, /Public release is blocked/);
  assert.match(visible, /does not collect or send reports/);
  assert.match(visible, /no response time is promised/);
  assert.ok(new RegExp(`datetime="${contactNotice.reviewedOn}"`, 'i').test(visible));
  assert.match(visible, /Once a verified route is published/);
  assert.match(visible, /Goal Hint match URL/);
  assert.match(visible, /supporting public source link/);
  assert.match(visible, /same locked forecast/);
  assert.match(visible, /do not replace the pick with a more favorable revision/);
  for (const [, href] of visible.matchAll(/<a\b[^>]*\bhref="([^"]+)"/g)) {
    const target = new URL(href.replaceAll('&amp;', '&'), origin);
    assert.equal(target.origin, origin.origin, 'Only fixed, same-origin navigation is available.');
    assert.equal(target.protocol, origin.protocol, 'No unchecked contact or executable link scheme.');
  }
  assert.equal((visible.match(/aria-current="page"/g) ?? []).length, 1);
  assert.ok([...visible.matchAll(/<a\b[^>]*>/g)].some(([tag]) => tag.includes('href="/en/contact"') && tag.includes('aria-current="page"')));
  assert.doesNotMatch(visible, /TODO|TBD|Lorem ipsum|example\.com|mailto:|tel:|untrusted-query|\{date\}/i);
  assert.doesNotMatch(visible, /<form|<iframe|<input|<textarea/i);
  console.log(`PASS production contact HTML and safe query handling: ${path}`);
}
for (const [path, section] of [['/en/privacy', 'privacy-choices'], ['/en/terms', 'terms-outcomes'], ['/en/how-it-works', 'corrections']]) {
  const response = await fetch(new URL(path, origin), { signal: AbortSignal.timeout(20_000) });
  assert.equal(response.status, 200, path);
  const visible = visibleHtml(await response.text());
  const content = visible.match(new RegExp(`<section\\b(?=[^>]*\\bid="${section}")[^>]*>[\\s\\S]*?<\\/section>`))?.[0];
  assert.ok(content, `Existing policy section: ${section}`);
  assert.match(content, /href="\/en\/contact"/);
  assert.match(content, /Contact availability and correction guidance/);
  if (path === '/en/how-it-works') assert.ok(visible.includes('id="settlement"'), 'Actual settlement target');
  console.log(`PASS contextual contact link: ${path}#${section}`);
}
console.log('PASS contact availability gate, correction guidance, anonymous metadata, safe links and policy integration.');
