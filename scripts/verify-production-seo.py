"""Read-only production smoke checks after the owner's public-indexing release."""
from datetime import datetime, timedelta, timezone
from html.parser import HTMLParser
import json
from urllib.parse import urlsplit
from xml.etree import ElementTree

from lib.rendering import request
from lib.runtime import main_guard

ORIGIN = 'https://goalhint.com'


class Head(HTMLParser):
    def __init__(self, source):
        super().__init__()
        self.meta, self.canonicals = {}, []
        self.feed(source)

    def handle_starttag(self, tag, attributes):
        attributes = dict(attributes)
        if tag == 'meta':
            self.meta[attributes.get('name') or attributes.get('property')] = attributes.get('content')
        if tag == 'link' and attributes.get('rel') == 'canonical':
            self.canonicals.append(attributes.get('href'))


def main():
    checks = 0

    def page(path, canonical, index):
        nonlocal checks
        response = request(ORIGIN, path, timeout=40)
        assert response.status == 200, path
        head = Head(response.text)
        assert head.canonicals == [ORIGIN + canonical], path
        assert head.meta.get('robots') == ('index, follow' if index else 'noindex, follow'), path
        if index:
            assert 'noindex' not in response.headers.get('x-robots-tag', ''), path
        checks += 1
        return response

    page('/en', '/en', True)
    page('/en?q=Arsenal', '/en?q=Arsenal', False)
    page('/en?tz=America%2FLos_Angeles', '/en?tz=America%2FLos_Angeles', False)
    page('/en/privacy', '/en/privacy', False)
    page('/en/terms', '/en/terms', False)
    robots = request(ORIGIN, '/robots.txt').text
    assert 'Sitemap: ' + ORIGIN + '/sitemap-index.xml' in robots
    checks += 1

    def locations(path):
        response = request(ORIGIN, path, timeout=40)
        assert response.status == 200 and 'xml' in response.headers.get('content-type', ''), path
        return [node.text for node in ElementTree.fromstring(response.text).iter() if node.tag.endswith('}loc')]

    maps = locations('/sitemap-index.xml')
    assert ORIGIN + '/sitemap.xml' in maps
    for url in maps:
        assert urlsplit(url).netloc == 'goalhint.com' and urlsplit(url).path.count('/') == 1, url
        urls = locations(urlsplit(url).path)
        if '/sitemap-matches-' in url and urls:
            path = urlsplit(urls[0]).path
            page(path, path, True)
        checks += 1
    today = str(datetime.now(timezone(timedelta(hours=3))).date())
    response = request(ORIGIN, '/api/matches?date=' + today + '&pageSize=1', timeout=40)
    assert response.status == 200
    feed = json.loads(response.text)
    assert feed['total'] > 0 and feed['state'] != 'data-unavailable'
    page('/en/predictions/' + today, '/en/predictions/' + today, True)
    checks += 1
    response = request(ORIGIN, '/api/performance', timeout=40)
    assert response.status == 200
    performance = json.loads(response.text)
    assert performance['cohort']['fixtureCount'] > 1000
    if performance['policy']['state'] == 'unapproved':
        assert all(cell['metrics']['hitRate'] is None for cell in performance['cells'])
    checks += 1
    assert request(ORIGIN, '/en/matches/00000000-0000-4000-8000-000000000000/unknown').status == 404
    checks += 1
    print(json.dumps({'passed': checks, 'today': today, 'fixtures': feed['total'],
        'performanceCohort': performance['cohort']['fixtureCount'], 'sitemaps': len(maps)}))


if __name__ == '__main__':
    main_guard(main)
