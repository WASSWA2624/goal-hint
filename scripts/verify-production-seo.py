"""Read-only production smoke checks after the owner's public-indexing release."""
from datetime import datetime, timedelta, timezone
from html.parser import HTMLParser
import json
from urllib.parse import urlsplit
from urllib.robotparser import RobotFileParser
from xml.etree import ElementTree

from lib.production_checks import CANONICAL_ORIGIN, get, origin_argument, private_response
from lib.policy_rendering import notices
from lib.runtime import CommandError, main_guard

ORIGIN = CANONICAL_ORIGIN


class PageMarkup(HTMLParser):
    ignored_tags = frozenset(('script', 'style', 'template', 'svg', 'math'))

    def __init__(self, source):
        super().__init__()
        self.meta, self.canonicals = {}, []
        self.titles, self.headings = [], []
        self.active_text = None
        self.ignored = 0
        self.feed(source)

    def handle_starttag(self, tag, attributes):
        if tag in self.ignored_tags:
            self.ignored += 1
        if self.ignored:
            return
        if tag in ('title', 'h1'):
            values = self.titles if tag == 'title' else self.headings
            values.append('')
            self.active_text = values
        attributes = dict(attributes)
        if tag == 'meta':
            name = attributes.get('name') or attributes.get('property')
            self.meta.setdefault(name.lower() if name else None, []).append(attributes.get('content'))
        if tag == 'link' and attributes.get('rel') == 'canonical':
            self.canonicals.append(attributes.get('href'))

    def handle_endtag(self, tag):
        if self.ignored:
            if tag in self.ignored_tags:
                self.ignored -= 1
            return
        if tag in ('title', 'h1'):
            self.active_text = None

    def handle_data(self, value):
        if self.active_text is not None and not self.ignored:
            self.active_text[-1] += value


def verify(origin, *, today=None):
    checks = 0

    def read(path, status=200):
        response = get(origin, path)
        if response.status != status:
            # Public status only: never print response bodies, query strings or arbitrary redirects.
            if urlsplit(response.headers.get('Location', '')).path == '/cgi-sys/suspendedpage.cgi':
                raise CommandError('Hosting suspension intercepts the public site. Restore hosting before SEO verification.')
            raise CommandError(f'Public SEO check expected HTTP {status}, received HTTP {response.status}.')
        return response

    def page(path, canonical, index):
        nonlocal checks
        response = read(path)
        head = PageMarkup(response.text)
        assert len(head.titles) == 1 and head.titles[0].strip(), 'One nonempty page title is required.'
        assert len(head.headings) == 1 and head.headings[0].strip(), 'One server-rendered main heading is required.'
        assert head.canonicals == [ORIGIN + canonical], path
        assert head.meta.get('robots') == ['index, follow' if index else 'noindex, follow'], path
        assert head.meta.get('og:url') == [ORIGIN + canonical], path
        descriptions = head.meta.get('description', [])
        assert len(descriptions) == 1 and descriptions[0] and descriptions[0].strip(), path
        if index:
            assert all('noindex' not in value.lower() and 'none' not in value.lower()
                for value in response.headers.get_all('X-Robots-Tag', [])), path
            assert all('noindex' not in value.lower() and 'none' not in value.lower()
                for name in ('googlebot', 'bingbot') for value in head.meta.get(name, []) if value), path
        checks += 1
        return response

    page('/en', '/en', True)
    page('/en/matches', '/en/matches', True)
    page('/en/matches?q=Arsenal', '/en/matches?q=Arsenal', False)
    page('/en/matches?tz=America%2FLos_Angeles', '/en/matches?tz=America%2FLos_Angeles', False)
    publication = notices()
    page('/en/privacy', '/en/privacy', publication['privacyNotice']['releaseReady'])
    page('/en/terms', '/en/terms', publication['termsNotice']['releaseReady'])
    for path in ('/admin', '/en/account', '/en/subscribe'):
        response = read(path)
        private_response(response, path, require_private=False)
        assert any('noindex' in value.lower() for value in PageMarkup(response.text).meta.get('robots', []) if value), path
        assert 'noindex' in response.headers.get('X-Robots-Tag', ''), path
        checks += 1
    robots = read('/robots.txt').text
    assert 'Sitemap: ' + ORIGIN + '/sitemap-index.xml' in robots
    assert any(line.strip() == 'Disallow: /admin' for line in robots.splitlines())
    rules = RobotFileParser()
    crawl_rules = []
    for line in robots.splitlines():
        directive, _, value = line.split('#', 1)[0].partition(':')
        # Access is allowed by default. The stdlib uses first-match rules, so a
        # redundant root Allow must not hide a more specific public-page block.
        if directive.strip().lower() != 'allow' or value.strip() != '/':
            crawl_rules.append(line)
    rules.parse(crawl_rules)
    for crawler in ('Googlebot', 'Bingbot'):
        for path in ('/en', '/en/matches'):
            assert rules.can_fetch(crawler, ORIGIN + path), 'Public landing pages are blocked by robots.txt.'
    checks += 1

    def locations(path, *, index=False):
        response = read(path)
        assert 'xml' in response.headers.get('content-type', ''), path
        namespace = '{http://www.sitemaps.org/schemas/sitemap/0.9}'
        document = ElementTree.fromstring(response.text)
        assert document.tag == namespace + ('sitemapindex' if index else 'urlset'), path
        entries = list(document)
        assert all(entry.tag == namespace + ('sitemap' if index else 'url') for entry in entries), 'Invalid sitemap entry namespace or type.'
        urls = []
        for entry in entries:
            values = entry.findall(namespace + 'loc')
            assert len(values) == 1 and values[0].text, 'Every sitemap entry needs one location.'
            url = values[0].text
            parsed = urlsplit(url)
            assert parsed.scheme == 'https' and parsed.netloc == 'goalhint.com' and parsed.path.startswith('/'), 'Noncanonical sitemap location.'
            assert not parsed.query and not parsed.fragment, 'Sitemaps must exclude query and fragment variants.'
            if not index:
                assert not any(parsed.path == base or parsed.path.startswith(base + '/')
                    for base in ('/admin', '/analytics', '/api', '/en/account', '/en/subscribe')), 'Private URLs must not appear in sitemaps.'
                for name, notice in publication.items():
                    if name.endswith('Notice') and not notice['releaseReady']:
                        assert parsed.path != '/en/' + name.removesuffix('Notice'), 'Unpublished information page in sitemap.'
            urls.append(url)
        assert len(urls) == len(set(urls)), 'Duplicate sitemap locations.'
        return urls

    maps = locations('/sitemap-index.xml', index=True)
    assert ORIGIN + '/sitemap.xml' in maps
    for url in maps:
        assert urlsplit(url).netloc == 'goalhint.com' and urlsplit(url).path.count('/') == 1, url
        urls = locations(urlsplit(url).path)
        if url == ORIGIN + '/sitemap.xml':
            assert {ORIGIN + '/en', ORIGIN + '/en/matches'} <= set(urls), 'Public landing pages are missing from the sitemap.'
        if '/sitemap-matches-' in url and urls:
            path = urlsplit(urls[0]).path
            page(path, path, True)
        checks += 1
    today = today or str(datetime.now(timezone(timedelta(hours=3))).date())
    response = read('/api/matches?date=' + today + '&pageSize=1')
    feed = json.loads(response.text)
    assert feed['total'] > 0 and feed['state'] != 'data-unavailable'
    page('/en/predictions/' + today, '/en/predictions/' + today, True)
    checks += 1
    response = read('/api/performance')
    performance = json.loads(response.text)
    cohort_count = performance['cohort']['fixtureCount']
    assert type(cohort_count) is int and cohort_count >= 0
    if performance['policy']['state'] == 'unapproved':
        assert all(cell['metrics']['hitRate'] is None for cell in performance['cells'])
    checks += 1
    read('/en/matches/00000000-0000-4000-8000-000000000000/unknown', 404)
    checks += 1
    print(json.dumps({'passed': checks, 'today': today, 'fixtures': feed['total'],
        'performanceCohort': performance['cohort']['fixtureCount'], 'sitemaps': len(maps)}))


def main():
    verify(origin_argument(__doc__))


if __name__ == '__main__':
    main_guard(main)
