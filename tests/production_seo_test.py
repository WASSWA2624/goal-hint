"""Production SEO checks must reject outages and conflicting crawl directives."""
from contextlib import redirect_stdout
from email.message import Message
from html import escape
import io
import json
from pathlib import Path
import runpy
import sys
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from lib.rendering import Response
from lib.runtime import CommandError

seo = runpy.run_path(str(ROOT / "scripts/verify-production-seo.py"))
ORIGIN = "https://goalhint.com"
TODAY = "2026-10-23"
MATCH = "/en/matches/10000000-0000-4000-8000-000000000001/synthetic-match"


def response(text, status=200, **values):
    headers = Message()
    for key, value in values.items():
        headers[key.replace("_", "-")] = value
    return Response(status, headers, text)


def page(path, index=True):
    canonical = escape(ORIGIN + path, quote=True)
    return response(f'<html lang="en"><head><link rel="canonical" href="{canonical}">'
        f'<meta name="robots" content="{"index" if index else "noindex"}, follow">'
        f'<meta property="og:url" content="{canonical}">'
        '<meta name="description" content="Synthetic fixture for SEO acceptance."></head></html>')


def sitemap(paths, *, index=False):
    item, root = ("sitemap", "sitemapindex") if index else ("url", "urlset")
    entries = "".join(f'<{item}><loc>{escape(ORIGIN + path)}</loc></{item}>' for path in paths)
    return response(f'<{root} xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{entries}</{root}>',
        Content_Type="application/xml")


class ProductionSeoTests(unittest.TestCase):
    def setUp(self):
        self.overrides = {}
        self.seen = []

    def read(self, origin, path):
        self.seen.append(path)
        if path in self.overrides:
            return self.overrides[path]
        if path == '/robots.txt':
            return response('User-Agent: *\nAllow: /\nDisallow: /admin\nSitemap: ' + ORIGIN + '/sitemap-index.xml')
        if path == '/sitemap-index.xml':
            return sitemap(['/sitemap.xml', '/sitemap-matches-0.xml', '/sitemap-archive-0.xml'], index=True)
        if path == '/sitemap.xml':
            return sitemap(['/en', '/en/matches'])
        if path == '/sitemap-matches-0.xml':
            return sitemap([MATCH])
        if path == '/sitemap-archive-0.xml':
            return sitemap(['/en/predictions/' + TODAY])
        if path.startswith('/api/matches?'):
            return response(json.dumps({'total': 1, 'state': 'ready'}))
        if path == '/api/performance':
            return response(json.dumps({'cohort': {'fixtureCount': 1}, 'policy': {'state': 'unapproved'},
                'cells': [{'metrics': {'hitRate': None}}]}))
        if path.endswith('/unknown'):
            return response('Not found', 404)
        if path in ('/admin', '/en/account', '/en/subscribe'):
            result = page(path, False)
            result.headers['Cache-Control'] = 'no-store'
            result.headers['X-Robots-Tag'] = 'noindex, nofollow'
            return result
        return page(path, '?' not in path and path not in ('/en/privacy', '/en/terms'))

    def verify(self):
        output = io.StringIO()
        with patch.dict(seo['verify'].__globals__, {'get': self.read,
                'notices': lambda: {key: {'releaseReady': False} for key in ('privacyNotice', 'termsNotice')}}), redirect_stdout(output):
            seo['verify']('http://127.0.0.1', today=TODAY)
        return json.loads(output.getvalue())

    def test_small_real_cohort_is_valid_and_matches_landing_is_checked(self):
        result = self.verify()
        self.assertEqual(result['performanceCohort'], 1)
        self.assertEqual(result['fixtures'], 1)
        self.assertIn('/en/matches', self.seen)

    def test_suspension_has_safe_actionable_diagnostic_and_stops(self):
        self.overrides['/en'] = response('Private response body', 302,
            Location='/cgi-sys/suspendedpage.cgi?private=value')
        with self.assertRaisesRegex(CommandError, 'Hosting suspension') as caught:
            self.verify()
        self.assertNotIn('private', str(caught.exception).lower())
        self.assertEqual(self.seen, ['/en'])

    def test_non_success_robots_and_sitemaps_cannot_pass_with_valid_body(self):
        for path in ('/robots.txt', '/sitemap-index.xml', '/sitemap-matches-0.xml'):
            with self.subTest(path=path):
                self.overrides.clear()
                invalid = self.read('', path)
                self.overrides[path] = Response(503, invalid.headers, invalid.text)
                with self.assertRaisesRegex(CommandError, 'received HTTP 503'):
                    self.verify()

    def test_duplicate_or_missing_metadata_cannot_hide_conflicts(self):
        for extra in ('<meta name="robots" content="noindex, follow">',
                '<meta property="og:url" content="https://goalhint.com/wrong">',
                '<meta name="description" content="Duplicate.">',
                '<link rel="canonical" href="https://goalhint.com/wrong">'):
            with self.subTest(extra=extra):
                valid = page('/en')
                self.overrides['/en'] = Response(200, valid.headers, valid.text.replace('</head>', extra + '</head>'))
                with self.assertRaises(AssertionError):
                    self.verify()

    def test_all_header_directives_are_checked_case_insensitively(self):
        for directive in ('NOINDEX, FOLLOW', 'none', 'googlebot: NoIndex'):
            with self.subTest(directive=directive):
                invalid = page('/en')
                invalid.headers['X-Robots-Tag'] = directive
                invalid.headers['X-Robots-Tag'] = 'index, follow'
                self.overrides['/en'] = invalid
                with self.assertRaises(AssertionError):
                    self.verify()

    def test_crawler_specific_metadata_cannot_override_indexable_claim(self):
        for name, directive in (('Googlebot', 'NOINDEX'), ('bingbot', 'none')):
            with self.subTest(name=name):
                valid = page('/en')
                extra = f'<meta name="{name}" content="{directive}">'
                self.overrides['/en'] = Response(200, valid.headers, valid.text.replace('</head>', extra + '</head>'))
                with self.assertRaises(AssertionError):
                    self.verify()

    def test_public_crawl_blocks_fail_even_when_sitemap_is_advertised(self):
        for directives in ('User-Agent: *\nDisallow: /',
                'User-Agent: *\nAllow: /\nDisallow: /en',
                'User-Agent: Googlebot\nDisallow: /en\n\nUser-Agent: *\nAllow: /'):
            with self.subTest(directives=directives):
                self.overrides['/robots.txt'] = response(directives + '\nDisallow: /admin\nSitemap: '
                    + ORIGIN + '/sitemap-index.xml')
                with self.assertRaises(AssertionError):
                    self.verify()

    def test_unapproved_accuracy_and_unavailable_fixtures_fail(self):
        for path, value in (('/api/performance', {'cohort': {'fixtureCount': 1}, 'policy': {'state': 'unapproved'},
                'cells': [{'metrics': {'hitRate': 100}}]}),
                ('/api/matches?date=' + TODAY + '&pageSize=1', {'total': 0, 'state': 'data-unavailable'})):
            with self.subTest(path=path):
                self.overrides.clear()
                self.overrides[path] = response(json.dumps(value))
                with self.assertRaises(AssertionError):
                    self.verify()


if __name__ == '__main__':
    unittest.main()
