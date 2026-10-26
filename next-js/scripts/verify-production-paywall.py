"""Read-only anonymous gate verification, after an owner-approved activation or on a local fixture."""
from html.parser import HTMLParser
import json
import re

from lib.production_checks import get, origin_argument, private_response
from lib.runtime import main_guard

FORECAST_KEYS = {"gated", "runId", "revisionId", "publishedAt", "families", "runSequence", "provisional", "updateDelayed"}
SNAPSHOT_KEYS = {"gated", "revisionId", "cycleId", "historical", "applicability", "publishedAt", "families"}
CARD_PICK = {"data-market", "data-prediction", "data-outcome", "data-pick-selection", "data-probability-meter", "data-pick-price", "data-pick-odds"}
NO_PICK = {"data-prediction": "none", "data-outcome": "unavailable"}


def free_access(value):
    assert value.get("access") == {"tier": "free", "signedIn": False}, "Expected anonymous gated access."


def gated_record(record):
    assert record.get("prices") == [], "Subscriber prices leaked."
    forecast = record.get("forecast")
    if forecast is not None:
        assert forecast.get("gated") is True and set(forecast) <= FORECAST_KEYS, "Subscriber forecast leaked."


def gated_html(source, *, cards=False):
    # Inspect raw HTML and embedded flight data, including escaped JSON keys. A feed page leaves its card markup to FeedCards.
    markup = "detail-market|featured-pick|verdict" + ("" if cards else "|prediction|outcome|market")
    assert not re.search(rf'data-(?:{markup})=', source), "Subscriber markup leaked."
    assert not re.search(r'[\\]*"(?:probabilities|alternatives|reasons|uncertainty)[\\]*"\s*:', source), "Subscriber flight data leaked."


def forecast_ids(feed):
    # The fixtures whose cards lock: those with a published family; forecast null or no family shows no prediction.
    return {record["fixtureId"] for record in feed["records"] if (record.get("forecast") or {}).get("families")}


class FeedCards(HTMLParser):
    """A card over a published forecast carries no pick markup. A forecastless card names its market with no prediction,
    as subscribers see it; nothing outside the cards carries pick markup."""

    def __init__(self, source, published):
        super().__init__()
        self.published, self.cards = published, []
        self.feed(source)

    def handle_starttag(self, tag, attributes):
        attributes = dict(attributes)
        if tag == "article":
            self.cards.append(attributes.get("data-fixture-id"))
        card = next((card for card in reversed(self.cards) if card), None)
        for name in CARD_PICK & set(attributes):
            assert card and card not in self.published and (name == "data-market" or attributes[name] == NO_PICK.get(name)), \
                "Unfinished card exposed a pick."

    def handle_endtag(self, tag):
        if tag == "article" and self.cards:
            self.cards.pop()


def verify(origin):
    checks = 0

    def read(path, *, wire=False):
        nonlocal checks
        response = get(origin, path)
        assert response.status == 200, path
        private_response(response, path)
        checks += 1
        return json.loads(response.text) if wire else response.text

    feed = read("/api/matches", wire=True)
    free_access(feed)
    for record in feed["records"]:
        gated_record(record)
    FeedCards(read("/en/matches"), forecast_ids(feed))
    best = read("/api/best-slips", wire=True)
    for slip in best["slips"]:
        assert set(slip) == {"rank", "totalOdds", "estimatedProbability", "matchCount"}, "Best Slips selections leaked."
    gated_html(read("/en"))
    upcoming = read("/api/matches?when=next-7-days&status=scheduled&pageSize=100", wire=True)
    free_access(upcoming)
    assert upcoming["records"], "No upcoming fixture available; gate verification is incomplete."
    for record in upcoming["records"]:
        assert record["status"] == "scheduled"
        gated_record(record)
    candidate = next((record for record in upcoming["records"] if record.get("forecast")), None)
    assert candidate is not None, "No published upcoming forecast available to verify the gate."
    fixture_id = candidate["fixtureId"]
    assert re.fullmatch(r"[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}", fixture_id)
    page = read("/en/matches?when=next-7-days&status=scheduled")
    gated_html(page, cards=True)
    FeedCards(page, forecast_ids(upcoming))
    detail = read(f"/api/matches/{fixture_id}", wire=True)
    free_access(detail)
    gated_record(detail["fixture"])
    assert detail["history"] == {"gated": True} and "odds" not in detail
    snapshot = detail.get("snapshot")
    assert snapshot and snapshot.get("gated") is True and set(snapshot) <= SNAPSHOT_KEYS
    # The detail's canonical path survives a team rename between the feed and detail reads.
    path = detail["route"]["path"]
    assert re.fullmatch(rf"/en/matches/{re.escape(fixture_id)}/[a-z0-9]+(?:-[a-z0-9]+)*", path)
    gated_html(read(path))
    news = read(f"/api/matches/{fixture_id}/insights?section=news", wire=True)
    free_access(news)
    assert news["section"] == "news" and news["fixtureId"] == fixture_id
    assert all(item["kind"] != "analysis" for item in news["data"]["items"]), "Goal Hint analysis leaked through news."
    print(json.dumps({"passed": checks, "anonymous": True, "method": "GET", "upcoming": len(upcoming["records"])}))


def main():
    verify(origin_argument(__doc__))


if __name__ == "__main__":
    main_guard(main, "Paid-access verification failed; keep or switch paid access off and investigate privately.")
