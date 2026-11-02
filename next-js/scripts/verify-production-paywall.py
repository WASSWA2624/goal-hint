"""Read-only anonymous gate verification, after an owner-approved activation or on a local fixture."""
from html.parser import HTMLParser
import json
import re

from lib.production_checks import get, origin_argument, private_response
from lib.runtime import main_guard

FORECAST_KEYS = {"gated", "runId", "revisionId", "publishedAt", "families", "runSequence", "provisional", "updateDelayed", "probabilities"}
SNAPSHOT_KEYS = {"gated", "revisionId", "cycleId", "historical", "applicability", "publishedAt", "families", "probabilities"}
COMPLETED = {"finished-regulation", "finished-extra-time", "finished-penalties", "canceled", "abandoned", "awarded"}
CARD_PICK = {"data-market", "data-prediction", "data-outcome", "data-pick-selection", "data-probability-meter", "data-pick-price", "data-pick-odds"}
NO_PICK = {"data-prediction": "none", "data-outcome": "unavailable"}


def free_access(value):
    assert value.get("access") == {"tier": "free", "signedIn": False}, "Expected anonymous gated access."


def gated_record(record):
    assert record.get("prices") == [], "Subscriber prices leaked."
    forecast = record.get("forecast")
    if forecast is not None:
        assert forecast.get("gated") is True and set(forecast) <= FORECAST_KEYS, "Subscriber forecast leaked."
        assert forecast.get("probabilities") == [], "Subscriber probability leaked."


def gated_html(source, *, cards=False):
    tags = re.findall(r"<[a-z][^>]*>", source, flags=re.I)
    assert not any(re.search(r'data-(?:detail-market|verdict)=|data-featured-pick="(?!none")', tag) for tag in tags), "Subscriber markup leaked."
    # The only probability transport allowed on an unfinished free forecast is an empty list.
    assert not re.search(r'[\\]*"(?:alternatives|reasons|uncertainty)[\\]*"\s*:', source), "Subscriber flight data leaked."
    assert not re.search(r'[\\]*"probabilities[\\]*"\s*:\s*\[\s*[^\]\s]', source), "Subscriber probability leaked."


def forecast_ids(feed):
    # The fixtures whose cards lock: those with a published family; forecast null or no family shows no prediction.
    return {record["fixtureId"] for record in feed["records"] if (record.get("forecast") or {}).get("families")}


class FeedCards(HTMLParser):
    """Only cards with a published locked forecast prohibit prediction attributes."""
    def __init__(self, source, published):
        super().__init__()
        self.published, self.elements = published, []
        self.feed(source)

    def handle_starttag(self, tag, attributes):
        attributes = dict(attributes)
        if tag not in {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}:
            self.elements.append((tag, attributes.get("data-fixture-id")))
        card = next((card for _, card in reversed(self.elements) if card), None)
        if card in self.published:
            for name in CARD_PICK & set(attributes):
                assert attributes[name] == NO_PICK.get(name), "Unfinished card exposed a pick."

    def handle_endtag(self, tag):
        for index in range(len(self.elements) - 1, -1, -1):
            if self.elements[index][0] == tag:
                del self.elements[index:]
                break


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
        if record["status"] not in COMPLETED: gated_record(record)
    FeedCards(read("/en/matches"), forecast_ids(feed))
    best = read("/api/best-slips", wire=True)
    for slip in best["slips"]:
        if slip.get("completed"):
            assert "slip" in slip, "Completed public slip missing."
        else:
            assert "slip" not in slip and "matchStates" not in slip, "Unfinished slip snapshot leaked."
            for leg in slip.get("preview", []):
                assert leg["fixture"].get("forecast") is None
                if leg["pick"] is not None: assert leg["fixture"]["status"] in COMPLETED
    home = read("/en")
    assert "data-subscriber-panel" not in home, "Unexpected access section beneath filters."
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
    news = get(origin, f"/api/matches/{fixture_id}/insights?section=news")
    private_response(news, "unfinished insights")
    assert news.status == 403 and json.loads(news.text)["error"]["code"] == "subscription-required"
    checks += 1
    print(json.dumps({"passed": checks, "anonymous": True, "method": "GET", "upcoming": len(upcoming["records"])}))


def main():
    verify(origin_argument(__doc__))


if __name__ == "__main__":
    main_guard(main, "Paid-access verification failed; keep or switch paid access off and investigate privately.")
