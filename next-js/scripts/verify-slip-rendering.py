"""Build the real slip UI against isolated synthetic stored records and verify anonymous SSR markup."""
from html.parser import HTMLParser
from decimal import Decimal
from pathlib import Path
import re
from urllib.parse import parse_qs, urlencode, urlsplit

from lib.rendering import Server, build_fixture, create_fixture, parse_args, request, visible_html
from lib.runtime import ROOT, main_guard


class Element:
    def __init__(self, tag="document", attrs=()):
        self.tag, self.attrs, self.children = tag, dict(attrs), []

    def nodes(self, tag=None, attr=None):
        found = []
        for child in self.children:
            if isinstance(child, Element):
                if (tag is None or child.tag == tag) and (attr is None or attr in child.attrs):
                    found.append(child)
                found.extend(child.nodes(tag, attr))
        return found

    @property
    def text(self):
        return "".join(child.text if isinstance(child, Element) else child for child in self.children)


class Document(HTMLParser):
    void = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}

    def __init__(self, markup):
        super().__init__(convert_charrefs=True)
        self.root = Element()
        self.stack = [self.root]
        self.feed(visible_html(markup))

    def handle_starttag(self, tag, attrs):
        element = Element(tag, attrs)
        self.stack[-1].children.append(element)
        if tag not in self.void:
            self.stack.append(element)

    def handle_startendtag(self, tag, attrs):
        self.stack[-1].children.append(Element(tag, attrs))

    def handle_endtag(self, tag):
        for index in range(len(self.stack) - 1, 0, -1):
            if self.stack[index].tag == tag:
                del self.stack[index:]
                break

    def handle_data(self, text):
        self.stack[-1].children.append(text)


def verify_clean_ledger_selection(card, path):
    """The selected three-row identity and facts order must survive every slip context."""
    meta = card.nodes(attr="data-ledger-meta")
    teams = card.nodes("h4", "data-teams")
    facts = card.nodes(attr="data-ledger-facts")
    assert len(meta) == len(teams) == len(facts) == 1, f"{path}: one metadata, match and prediction row"
    descendants = card.nodes()
    assert descendants.index(meta[0]) < descendants.index(teams[0]) < descendants.index(facts[0]), f"{path}: metadata precedes teams and prediction facts"
    kickoff = meta[0].nodes("time", "data-kickoff")
    competition = meta[0].nodes(attr="data-competition")
    country = meta[0].nodes(attr="data-country")
    assert len(kickoff) == len(competition) == len(country) == 1, f"{path}: top row retains date/time, league and country"
    metadata = meta[0].nodes()
    assert metadata.index(kickoff[0]) < metadata.index(competition[0]) < metadata.index(country[0]), f"{path}: date/time lead league and country"
    assert re.search(r"\b\d{1,2}-[A-Z][a-z]{2}\s*\d{1,2}:\d{2}\s+(?:AM|PM)\b", kickoff[0].text), f"{path}: compact day-month and time with AM/PM"
    assert kickoff[0].attrs.get("datetime", "").endswith("Z"), f"{path}: kickoff retains its machine-readable UTC instant"
    assert "EAT" in kickoff[0].text + kickoff[0].attrs.get("title", ""), f"{path}: kickoff identifies the reporting timezone"
    versus = teams[0].nodes(attr="data-versus")
    assert len(versus) == 1 and versus[0].text == "VS", f"{path}: concise match separator"
    fields = [facts[0].nodes(attr=attribute) for attribute in ("data-market-label", "data-pick-label", "data-leg-odds", "data-leg-probability")]
    assert all(len(field) == 1 for field in fields), f"{path}: market, prediction, odds and probability are distinct"
    facts_order = facts[0].nodes()
    positions = [facts_order.index(field[0]) for field in fields]
    assert positions == sorted(positions), f"{path}: prediction facts preserve the requested reading order"


SCENARIOS = {
    "generated": ("generated", 3), "idle": ("idle", 0), "no-qualifying": ("no-qualifying", 0),
    "no-combinations": ("no-combinations", 0), "odds-unavailable": ("odds-unavailable", 0),
    "model-unavailable": ("model-unavailable", 0), "joint-generated": ("generated", 3),
    "data-unavailable": ("data-unavailable", 0), "rate-limited": ("rate-limited", 0),
    "limited": ("generated", 3), "long-names": ("generated", 3),
    "manual-home-win": ("generated", 1),
}

CRITERIA_GROUP_FIELDS = {
    "limits": ["oddsMin", "oddsMax", "probMin", "probMax"],
    "kickoff": ["dateFrom", "dateTo", "timeFrom", "timeTo"],
    "markets": [],
}

NUMERIC_RANGE_LIMITS = {
    "totalMin": "1.01", "totalMax": "100000", "teamsMin": "1", "teamsMax": "8",
    "oddsMin": "1.01", "oddsMax": "1000", "probMin": "0", "probMax": "100",
    "totalProbMin": "0", "totalProbMax": "100",
}


def criteria_groups(document, path, error_group=None):
    groups = document.nodes("dialog", "data-slip-criteria-group")
    assert len(groups) == 3, f"{path}: three native criteria dialogs"
    by_name = {group.attrs["data-slip-criteria-group"]: group for group in groups}
    assert set(by_name) == set(CRITERIA_GROUP_FIELDS), f"{path}: limits, kickoff and markets groups"
    option_rows = document.nodes(attr="data-slip-criteria-options")
    assert len(option_rows) == 1, f"{path}: one compact row of optional criteria"
    triggers = option_rows[0].nodes("button")
    assert len(triggers) == 3, f"{path}: three optional criteria buttons"
    assert all(button.attrs.get("type") == "button" and button.attrs.get("aria-haspopup") == "dialog" for button in triggers), f"{path}: optional criteria open dialogs without submitting"
    values = {}
    for name, group in by_name.items():
        assert "open" in group.attrs and group.attrs.get("data-enhanced") == "false", f"{path}: {name} stays available inline before hydration"
        assert len([button for button in triggers if button.attrs.get("aria-controls") == group.attrs.get("id")]) == 1, f"{path}: one trigger targets the {name} dialog"
        labelled_by = group.attrs.get("aria-labelledby")
        assert labelled_by and any(node.attrs.get("id") == labelled_by and node.text.strip() for node in group.nodes()), f"{path}: accessible {name} dialog title"
        buttons = group.nodes("button")
        assert any(button.text.strip() == "Cancel" and button.attrs.get("type") == "button" for button in buttons), f"{path}: {name} has a non-submitting Cancel action"
        assert any(button.text.strip() == "Apply" and button.attrs.get("type") == "button" for button in buttons), f"{path}: {name} has a non-submitting Apply action"
        inputs = group.nodes("input")
        values[name] = tuple((node.attrs.get("name"), node.attrs.get("value", ""), "checked" in node.attrs) for node in inputs)
        optional_joint = ["totalProbMin", "totalProbMax"] if name == "limits" and any(node.attrs.get("name") == "totalProbMin" for node in inputs) else []
        for field in CRITERIA_GROUP_FIELDS[name] + optional_joint:
            controls = [node for node in inputs if node.attrs.get("name") == field]
            assert len(controls) == 1 and "disabled" not in controls[0].attrs, f"{path}: {name} keeps enabled native {field}"
            assert len([node for node in document.nodes("input") if node.attrs.get("name") == field]) == 1, f"{path}: no duplicated {field}"
        assert all("disabled" not in fieldset.attrs for fieldset in group.nodes("fieldset")), f"{path}: dialog presentation does not disable native submission"
        if name == error_group:
            assert any(node.attrs.get("aria-invalid") == "true" for node in group.nodes()), f"{path}: {name} exposes the invalid controls"
            assert group.nodes(attr="role") and any(node.attrs.get("role") == "alert" for node in group.nodes()), f"{path}: {name} contains its validation message"
    markets = [node for node in document.nodes(attr="data-criteria-field") if node.attrs["data-criteria-field"] == "markets"]
    assert len(markets) == 1 and markets[0] in by_name["markets"].nodes(), f"{path}: market toggles and outcomes share their own dialog"
    targets = [node for node in document.nodes(attr="data-criteria-field") if node.attrs["data-criteria-field"] == "targets"]
    assert len(targets) == 1 and all(targets[0] not in group.nodes() for group in groups), f"{path}: essential slip targets always stay visible"
    for name in ["slips", "totalMin", "totalMax", "teamsMin", "teamsMax"]:
        controls = [node for node in document.nodes("input") if node.attrs.get("name") == name]
        assert len(controls) == 1 and "disabled" not in controls[0].attrs, f"{path}: one enabled essential target {name}"
        assert all(controls[0] not in group.nodes() for group in groups), f"{path}: essential {name} remains outside dialogs"
    inputs = document.nodes("input")
    reuse = [node for node in inputs if node.attrs.get("name") == "reuse"]
    choices = [node for node in markets[0].nodes("input")
               if node.attrs.get("name") == "markets" or (node.attrs.get("name") or "").startswith("picks.")]
    assert len(reuse) == 2 and all(node in by_name["markets"].nodes() for node in reuse), f"{path}: hidden reuse value and checkbox belong to Markets"
    assert reuse and choices and min(inputs.index(node) for node in reuse) > max(inputs.index(node) for node in choices), f"{path}: match reuse follows Markets in native keyboard order"
    return values


def inspect(origin, path, directory, name, expected_state, expected_slips, selections_per_slip=2, error_group=None):
    response = request(origin, path)
    assert response.status == 200, f"{path}: status {response.status}"
    assert response.headers.get("set-cookie") is None, f"{path}: no visitor cookie"
    (directory / f"{name}.html").write_text(response.text, encoding="utf-8")
    document = Document(response.text).root
    assert len(document.nodes("h1")) == 1, f"{path}: one page heading"
    assert len(document.nodes("main")) == 1, f"{path}: one main landmark"
    assert not document.nodes(attr="data-performance-summary"), f"{path}: generation has no historical or outcome performance summary"
    assert not document.nodes(attr="data-slip-history"), f"{path}: generation does not render completed saved slips"
    assert not any(node.attrs.get("id") == "completed-slips" for node in document.nodes()), f"{path}: no completed-slips section"
    assert not any(node.text.strip() in {"Save slip for tracking", "Saving…", "Slip saved"} for node in document.nodes("button")), f"{path}: no saving actions, including for signed-in members"
    assert all(node.attrs.get("method", "get").lower() == "get" for node in document.nodes("form")), f"{path}: builder forms are read-only GET requests"
    assert "Saved slip performance" not in document.text and "Completed slips" not in document.text, f"{path}: no saved history content at any viewport"
    criteria_groups(document, path, error_group)
    inputs = document.nodes("input")
    for kind in ["date", "time"]:
        assert len([node for node in inputs if node.attrs.get("type") == kind]) == 2, f"{path}: two {kind} fields"
    for field in ["dateFrom", "dateTo", "timeFrom", "timeTo", "totalMin", "totalMax", "oddsMin", "oddsMax",
                  "probMin", "probMax", "teamsMin", "teamsMax", "slips", "reuse"]:
        assert any(node.attrs.get("name") == field for node in inputs), f"{path}: native GET field {field}"
    assert any(node.attrs.get("name") == "markets" for node in document.nodes()), f"{path}: market criteria"
    outcomes = [node for node in inputs if (node.attrs.get("name") or "").startswith("picks.")]
    assert len(outcomes) == 10 and all(node.attrs.get("type") == "checkbox" for node in outcomes), f"{path}: all 10 named outcome choices"
    forms = document.nodes("form")
    assert any(node.attrs.get("method", "get").lower() == "get" and node.attrs.get("action") == "/en/slips" for node in forms), f"{path}: native GET action"
    links = [node for nav in document.nodes("nav") for node in nav.nodes("a") if node.attrs.get("href") == "/en/slips"]
    assert len(links) >= 2 and all(node.attrs.get("aria-current") == "page" for node in links), f"{path}: Slips navigation"
    assert len([node for node in document.nodes("summary") if "More" in node.text]) >= 2, f"{path}: desktop/mobile overflow menus"
    states = document.nodes(attr="data-slip-state")
    assert len(states) == 1 and states[0].attrs["data-slip-state"] == expected_state, f"{path}: explicit result state"
    slips = document.nodes(attr="data-slip-id")
    assert len(slips) == expected_slips, f"{path}: expected {expected_slips} slips, found {len(slips)}"
    rows = document.nodes("li", "data-slip-selection")
    if expected_slips:
        assert len(rows) == expected_slips * selections_per_slip, f"{path}: one row per selection"
        for slip in slips:
            assert slip.attrs.get("data-compact-slip") == "clean-ledger", f"{path}: chosen Clean ledger design serves generated slips"
            headers = slip.nodes("header", "data-slip-summary")
            assert len(headers) == 1 and len(headers[0].nodes("h3")) == 1, f"{path}: static compact slip title header"
            summary = headers[0].text
            assert "%" in summary and re.search(r"\d+\.\d{2}", summary), f"{path}: title odds and average probability"
            count_labels = headers[0].nodes(attr="data-summary-count")[0].nodes("span")
            assert any(re.fullmatch(rf"{selections_per_slip}\s+selections?", label.text) for label in count_labels), f"{path}: selection count in title summary"
            assert len(headers[0].nodes(attr="data-summary-average")) == 1 and "Average match probability" in summary, f"{path}: summary identifies the mean"
            assert "Win probability" not in summary and "Combined" not in summary, f"{path}: summary replaces whole-slip winning probability"
            assert len(slip.nodes("a", "data-fixture-id")) == selections_per_slip, f"{path}: one compact analysis link per original selection"
            assert not slip.nodes("table"), f"{path}: no duplicate selection table"
        for row in rows:
            assert "Synthetic" in row.text and "%" in row.text, f"{path}: real synthetic selection details"
            assert re.search(r"\d+\.\d{2}", row.text), f"{path}: selection price"
            cards = row.nodes("a", "data-fixture-id")
            assert len(cards) == 1 and cards[0].attrs["data-fixture-id"] == row.attrs["data-slip-selection"], f"{path}: compact analysis row retains fixture identity"
            card = cards[0]
            verify_clean_ledger_selection(card, path)
            assert card.attrs["href"].startswith("/en/matches/"), f"{path}: original fixture remains linked to analysis"
            labels = card.nodes(attr="data-pick-label")
            assert len(labels) == 1 and re.fullmatch(r"1|X|2|1X|X2|12|[OU] \d+(?:\.\d+)?|Yes|No", labels[0].text), f"{path}: one compact prediction outcome"
            assert labels[0].attrs.get("title") and labels[0].attrs["title"] != labels[0].text, f"{path}: compact outcomes retain their full meaning"
            prices = card.nodes(attr="data-leg-odds")
            assert len(prices) == 1 and re.fullmatch(r"\d+\.\d{2}", prices[0].nodes("strong")[0].text), f"{path}: original selected price remains visible"
            assert len(card.nodes("h4")) == 1, f"{path}: match heading follows its slip heading"
            assert len(card.nodes(attr="data-home")) == len(card.nodes(attr="data-away")) == 1, f"{path}: both full team names remain available"
            assert card.nodes(attr="data-competition") and card.nodes(attr="data-country") and card.nodes("time", "data-kickoff"), f"{path}: competition, country and kickoff remain visible"
            assert card.nodes(attr="data-market-label"), f"{path}: compact outcome retains its market context"
            assert card.attrs.get("data-status") == "unknown" and card.attrs.get("data-match-state") == "snapshot", f"{path}: original snapshots never invent a live or final fixture status"
            assert card.attrs["data-outcome"] == "pending" and not card.nodes(attr="data-saved-score"), f"{path}: an original selection without a saved result invents no outcome or score"
        assert "Average match probability" in document.text, f"{path}: average is identified correctly"
        assert "not the chance that every selection wins" in document.text, f"{path}: mean is distinguished from joint probability"
    else:
        assert not rows and not document.nodes("tbody"), f"{path}: no invented selections in empty/unavailable states"
        assert "Synthetic Home" not in document.text, f"{path}: no synthetic selections leaked into production-like idle state"
    assert 0 <= response.text.find("data-styled=") < response.text.find("<main"), f"{path}: initial styles before content"
    print(f"PASS slip SSR: {name} ({expected_state}, {expected_slips} slips)", flush=True)
    return document


def native_inputs(document):
    """Successful GET controls, including the title's form-associated slip count."""
    form = next(node for node in document.nodes("form") if node.attrs.get("action") == "/en/slips")
    descendants = form.nodes("input")
    form_id = form.attrs.get("id")
    fields = []
    for node in document.nodes("input"):
        if node not in descendants and not (form_id and node.attrs.get("form") == form_id):
            continue
        name = node.attrs.get("name")
        if not name or "disabled" in node.attrs or node.attrs.get("type") in ("button", "submit", "reset"):
            continue
        if node.attrs.get("type") in ("checkbox", "radio") and "checked" not in node.attrs:
            continue
        fields.append((name, node.attrs.get("value", "")))
    return fields


def verify_defaults(document):
    fields = dict(native_inputs(document))
    assert fields["slips"] == "3", "SSR default requests three slips"
    for name in NUMERIC_RANGE_LIMITS:
        controls = [node for node in document.nodes("input") if node.attrs.get("name") == name]
        if name.startswith("totalProb"):
            assert not controls, "Unqualified default form does not offer combined-estimate fields"
            continue
        assert len(controls) == 1 and fields[name] == "", f"Default {name}: blank means any supported bound"
        assert controls[0].attrs.get("placeholder") == "Any", f"Default {name}: blank numeric range displays Any"
    assert fields["dateFrom"] == "2026-10-13" and fields["dateTo"] == "2026-11-12", "SSR defaults use the fixture's reporting date and inclusive 31-day range"
    assert fields["timeFrom"] == "00:00" and fields["timeTo"] == "23:59", "SSR defaults explicitly select all-day kickoff times"
    assert fields["reuse"] == "0", "SSR default leaves match reuse off"
    assert len([name for name, _ in native_inputs(document) if name == "slips"]) == 1, "The title count remains part of native GET submission"
    quantity = next(node for node in document.nodes("input") if node.attrs.get("name") == "slips")
    assert quantity.attrs.get("max") == "100", "The native quantity control supports up to 100 slips"


def verify_custom_numeric_bounds(document, expected):
    fields = dict(native_inputs(document))
    for name, limit in NUMERIC_RANGE_LIMITS.items():
        if name in expected:
            if Decimal(expected[name]) == Decimal(limit):
                assert fields[name] == "", f"Unrestricted {name}: explicit supported boundary displays Any"
            else:
                assert Decimal(fields[name]) == Decimal(expected[name]), f"Custom {name}: expected {expected[name]}, found {fields[name]}"


def verify_generated_limits(document, *, total_min, total_max, odds_min, odds_max, prob_min, prob_max, selections, reuse):
    fixture_ids = []
    for slip in document.nodes(attr="data-slip-id"):
        rows = slip.nodes("li", "data-slip-selection")
        assert len(rows) == selections, "Generated slips honor the exact requested matches per slip"
        exact_total = Decimal(1)
        for row in rows:
            fixture_ids.append(row.attrs["data-slip-selection"])
            price = Decimal(row.nodes(attr="data-leg-odds")[0].nodes("strong")[0].text)
            probabilities = [node.text.strip() for parent in row.nodes(attr="data-leg-probability") for node in parent.nodes("strong")
                if re.fullmatch(r"\d+(?:\.\d+)?%", node.text.strip())]
            assert len(probabilities) == 1, "Every generated selection exposes its own forecast probability"
            probability = Decimal(probabilities[0].rstrip("%"))
            assert Decimal(odds_min) <= price <= Decimal(odds_max), "Every selected original price honors the individual odds bounds"
            assert Decimal(prob_min) <= probability <= Decimal(prob_max), "Every selected forecast honors the individual probability bounds"
            exact_total *= price
        assert Decimal(total_min) <= exact_total <= Decimal(total_max), "Every slip's exact odds product honors both total bounds"
    if not reuse:
        assert len(fixture_ids) == len(set(fixture_ids)), "Match reuse stays disabled across the entire generated batch"


def verify_best_slips(origin, directory):
    for scenario, count in [("entitled", 3), ("locked", 3), ("locked-member", 3), ("hundred", 100), ("limited", 3)]:
        locked = scenario in {"locked", "locked-member"}
        response = request(origin, f"/best-slips/{scenario}")
        assert response.status == 200, f"Best Slips {scenario}: HTTP 200"
        (directory / f"best-slips-{scenario}.html").write_text(response.text, encoding="utf-8")
        document = Document(response.text).root
        disclosures = document.nodes("details", "data-slip-disclosure")
        assert len(disclosures) == count, f"Best Slips {scenario}: renders all {count} slips"
        assert all(node.attrs["data-compact-slip"] == "clean-ledger" for node in document.nodes(attr="data-compact-slip")), f"Best Slips {scenario}: selected Clean ledger disclosure serves every viewer"
        averages = []
        for index, disclosure in enumerate(disclosures):
            assert "open" not in disclosure.attrs, f"Best Slips {scenario}: slip {index + 1} starts collapsed before hydration"
            toggles = disclosure.nodes("summary", "data-slip-toggle")
            assert len(toggles) == 1, f"Best Slips {scenario}: one native summary toggles the entire header"
            toggle = toggles[0]
            assert not any(toggle.nodes(tag) for tag in ["a", "button", "input"]), "Header toggles have no competing interactive descendants"
            assert not any(toggle.nodes(tag) for tag in ["dl", "div", "fieldset"]), "Native summaries contain valid phrasing and heading content"
            assert f"Slip {index + 1}" in toggle.text, "Each collapsed header retains its rank"
            assert "Total odds" in toggle.text and "Average match probability" in toggle.text, "Collapsed headers retain odds and mean probability context"
            assert "Win probability" not in toggle.text and "Combined" not in toggle.text, "Winning probability is replaced by the average"
            assert toggle.nodes(attr="data-summary-odds")[0].nodes("strong")[0].text == "3.06", "Every viewer sees the original whole-slip odds"
            average = Decimal(toggle.nodes(attr="data-summary-average")[0].nodes("strong")[0].text.rstrip("%"))
            assert average == Decimal("80") + Decimal(index) / 10, "Every viewer sees the original mean, distinct from the joint win estimate"
            averages.append(average)
            contents = disclosure.nodes(attr="data-slip-content")
            assert len(contents) == 1, "Every toggle owns one expandable content region"
            if locked:
                assert not contents[0].nodes(attr="data-fixture-id"), "Locked slip bodies expose no premium picks"
                links = contents[0].nodes("a")
                expected_action = "Subscribe" if scenario == "locked-member" else "Log in to access"
                assert len(links) == 1 and links[0].text.strip() == expected_action, "The locked body has exactly the relevant access action"
                assert contents[0].text.strip() == expected_action, "The locked body contains no redundant subscriber explanation"
                destination = urlsplit(links[0].attrs["href"])
                if scenario == "locked-member":
                    assert destination.path == "/en/subscribe", "Signed-in viewers go directly to subscription"
                else:
                    assert destination.path == "/en/account" and parse_qs(destination.query).get("view", ["login"]) == ["login"], "Guests go directly to login"
                assert "Synthetic" not in document.text and not document.nodes(attr="data-slip-id"), "Public results contain no slip identity or synthetic picks"
                assert not re.search(r"synthetic-best-|synthetic-slip-|\"selections\"|\"homeTeam\"|\"awayTeam\"|\"forecast\"", response.text), "Locked HTML and flight data contain no private slip details"
            else:
                assert len(contents[0].nodes("li", "data-slip-selection")) == 2, "Expanding reveals the original matches"
                for selection in contents[0].nodes("a", "data-fixture-id"):
                    verify_clean_ledger_selection(selection, f"Best Slips {scenario}")
        assert averages == sorted(averages), "Displayed means do not reorder the existing joint-probability ranking"
        statuses = [node.text for node in document.nodes(attr="role") if node.attrs["role"] == "status"]
        assert bool(statuses) == (scenario == "limited"), "A valid smaller cohort needs no arbitrary minimum-count warning"
        assert "Fewer than ten" not in document.text, "The removed ten-slip restriction is absent from displayed copy"
        assert "The matches and selections in this slip are for subscribers." not in document.text, "Locked slips omit the removed explanatory sentence"
        print(f"PASS Best Slips SSR: {scenario} ({count} collapsed slips)", flush=True)


def verify(origin, directory):
    verify_best_slips(origin, directory)
    snapshots = request(origin, "/snapshot-cards")
    assert snapshots.status == 200
    snapshot_cards = {node.attrs["data-fixture-id"]: node for node in Document(snapshots.text).root.nodes("article", "data-fixture-id")}
    authorized = snapshot_cards["snapshot-authorized"]
    assert authorized.nodes(attr="data-card-odds")[0].text == "7.73" and "23.5%" in authorized.text, "Original saved probability and price survive the shared card"
    assert authorized.nodes(attr="data-pick-selection")[0].text == "1", "The saved alternative remains selected with its shared short form"
    assert authorized.nodes(attr="data-result-badge")[0].attrs["data-result-badge"] == "incorrect", "Supplied saved loss survives an unknown current fixture status"
    assert re.search(r"Score after 90 minutes: .+ 2, .+ 1", authorized.text), "A supplied 2–1 regulation score retains its own score label"
    assert authorized.nodes(attr="data-match-state")[0].attrs["data-match-state"] == "snapshot", "No final or live phase is invented"
    for name in ["gated", "redacted", "offline"]:
        card = snapshot_cards["snapshot-" + name]
        assert not card.nodes(attr="data-pick-selection") and not card.nodes(attr="data-card-odds"), f"{name}: saved pick and odds are hidden"
        assert "7.73" not in card.text and "23.5%" not in card.text, f"{name}: no saved premium values in rendered text"
        assert not card.nodes(attr="data-outcome") or all(node.attrs["data-outcome"] == "unavailable" for node in card.nodes(attr="data-outcome")), f"{name}: saved settlement is hidden"
    print("PASS saved snapshot cards: original alternative, price/probability, regulation score/outcome, gated/redacted/offline display boundaries.", flush=True)
    compact = Document(snapshots.text).root.nodes(attr="data-compact-snapshot")[0]
    compact_row = compact.nodes("a", "data-fixture-id")[0]
    verify_clean_ledger_selection(compact_row, "Compact saved selection")
    assert compact_row.attrs["data-fixture-id"] == "snapshot-compact-authorized", "Compact saved rows retain original fixture identity"
    assert compact_row.nodes(attr="data-leg-odds")[0].nodes("strong")[0].text == "7.73", "Compact saved rows retain the original alternative price"
    assert compact_row.nodes(attr="data-leg-probability")[0].nodes("strong")[0].text == "23.5%", "Compact saved rows retain original probability precision"
    assert compact_row.nodes(attr="data-pick-label")[0].text == "1", "Compact saved rows retain the original selected alternative"
    assert compact_row.attrs["data-outcome"] == "incorrect" and "Loss" in compact_row.nodes(attr="data-result")[0].text, "Compact saved rows retain supplied settlement"
    assert compact_row.attrs.get("data-status") == "unknown" and compact_row.attrs.get("data-match-state") == "snapshot", "Compact saved settlements never invent current fixture state"
    assert "Score after 90 minutes: 2–1" in compact_row.nodes(attr="data-saved-score")[0].text, "Compact saved regulation scores keep their own explicit meaning"
    print("PASS compact saved slip: original alternative, price/probability and supplied regulation score/outcome.", flush=True)
    for scenario, (state, count) in SCENARIOS.items():
        document = inspect(origin, f"/cases/{scenario}", directory, scenario, state, count,
            selections_per_slip=1 if scenario == "manual-home-win" else 2)
        if scenario == "limited":
            assert "search reached its limit" in document.text and "Fixture coverage is incomplete" in document.text, "Source and search limits remain visible"
        if scenario == "joint-generated":
            assert "Highest estimated combined probability first" in document.text, "Qualified custom ranking is described separately"
            assert all("Win probability" not in node.text and "Average match probability" in node.text
                for node in document.nodes(attr="data-slip-summary")), "Qualified custom slips show the mean while retaining joint ranking context separately"
    idle = inspect(origin, "/en/slips", directory, "route-idle", "idle", 0)
    verify_defaults(idle)
    explicit_defaults = [(name, NUMERIC_RANGE_LIMITS.get(name, value)) for name, value in native_inputs(idle) if name != "build"]
    canonical = inspect(origin, "/en/slips?" + urlencode(explicit_defaults), directory, "route-default-bounds", "idle", 0)
    verify_defaults(canonical)
    query = [
        ("dateFrom", "2026-10-13"), ("dateTo", "2026-10-19"), ("timeFrom", ""), ("timeTo", ""),
        ("markets", "match-result"), ("markets", "total-goals"), ("markets", "both-teams-to-score"),
        ("totalMin", "3.00"), ("totalMax", "6.00"), ("oddsMin", "1.25"), ("oddsMax", "2.60"),
        ("probMin", "70"), ("probMax", "100"), ("teamsMin", "2"), ("teamsMax", "4"),
        ("slips", "3"), ("reuse", "0"), ("reuse", "1"), ("build", "1"),
    ]
    generated = inspect(origin, "/en/slips?" + urlencode(query), directory, "route-build", "generated", 3)
    unavailable = inspect(origin, "/en/slips?" + urlencode(query + [("totalProbMin", "60")]), directory, "route-no-joint-model", "model-unavailable", 0)
    assert "Clear the combined probability bounds" in unavailable.text, "Unsupported joint filtering fails with a useful recovery action"
    joint_query = query + [("totalProbMin", "60"), ("totalProbMax", "90")]
    qualified = inspect(origin, "/joint?" + urlencode(joint_query), directory, "route-joint-build", "generated", 3)
    assert "Highest estimated combined probability first" in qualified.text, "Real route and stored service apply the verified synthetic binding"
    for field in ("totalProbMin", "totalProbMax"):
        assert any(node.attrs.get("name") == field for node in qualified.nodes("input")), "Qualified route offers combined estimate bounds"
    assert all("Win probability" not in node.text and "Average match probability" in node.text for node in qualified.nodes(attr="data-slip-summary")), "Real route uses the compact mean summary"
    verify_custom_numeric_bounds(generated, dict(query))
    initial_groups = criteria_groups(generated, "/en/slips?build=1")
    for group, changes in [
        ("limits", {"oddsMin": "1.50", "oddsMax": "2.50", "probMin": "75", "probMax": "90"}),
        ("kickoff", {"dateTo": "2026-10-15", "timeFrom": "12:30", "timeTo": "18:00"}),
    ]:
        changed = [(field, changes.get(field, value)) for field, value in query]
        draft = inspect(origin, "/en/slips?" + urlencode(changed), directory, f"route-{group}-summary", "generated", 3)
        verify_custom_numeric_bounds(draft, dict(changed))
        assert criteria_groups(draft, f"{group} draft")[group] != initial_groups[group], f"{group} dialog retains changed native draft values"
    chosen_query = query + [("picks.match-result", "home-win")]
    chosen = inspect(origin, "/en/slips?" + urlencode(chosen_query), directory, "route-market-summary", "generated", 3)
    chosen_inputs = criteria_groups(chosen, "manual market draft")["markets"]
    assert ("picks.match-result", "home-win", True) in chosen_inputs, "Markets dialog retains manually selected results"
    no_markets = [(name, value) for name, value in query if name != "markets"]
    invalid_markets = inspect(origin, "/en/slips?" + urlencode(no_markets), directory, "route-invalid-markets", "idle", 0, error_group="markets")
    assert "Select at least one market" in invalid_markets.text, "No-market validation opens the market controls"
    invalid_outcomes = query + [("picks.match-result", "yes")]
    invalid_pick = inspect(origin, "/en/slips?" + urlencode(invalid_outcomes), directory, "route-invalid-outcomes", "idle", 0, error_group="markets")
    assert "Choose Automatic or valid results" in invalid_pick.text, "Invalid manual results open the same market group"
    cutoff = inspect(origin, "/cutoff?" + urlencode(query), directory, "route-cutoff", "generated", 3)
    assert all(row.attrs["data-slip-selection"] != "synthetic-slip-1" for row in cutoff.nodes("li", "data-slip-selection")), "The route passes the fresh completion clock through to its stored build service"
    invalid = [(name, "2026-10-12" if name == "dateTo" else value) for name, value in query]
    document = inspect(origin, "/en/slips?" + urlencode(invalid), directory, "route-invalid", "idle", 0, error_group="kickoff")
    assert "Choose a valid kickoff date range" in document.text, "Invalid criteria have a specific explanatory error"
    invalid_no_reuse = [(name, value) for name, value in invalid if not (name == "reuse" and value == "1")]
    invalid_draft = inspect(origin, "/en/slips?" + urlencode(invalid_no_reuse), directory, "route-invalid-no-reuse", "idle", 0, error_group="kickoff")
    assert all("checked" not in node.attrs for node in invalid_draft.nodes("input") if node.attrs.get("name") == "reuse" and node.attrs.get("type") == "checkbox"), "Invalid criteria retain an unchecked reuse draft"
    for group, field, value in [("targets", "totalMin", "7.00"), ("limits", "oddsMin", "3.00")]:
        invalid_range = [(name, value if name == field else current) for name, current in query]
        invalid_group = inspect(origin, "/en/slips?" + urlencode(invalid_range), directory, f"route-invalid-{group}", "idle", 0, error_group=group)
        assert any(node.attrs.get("name") == field and node.attrs.get("aria-invalid") == "true" for node in invalid_group.nodes("input")), f"{group} error exposes its invalid field"
    blank_quantity = [(name, "" if name == "slips" else value) for name, value in query]
    required = inspect(origin, "/en/slips?" + urlencode(blank_quantity), directory, "route-required-quantity", "idle", 0, error_group="targets")
    quantity = next(node for node in required.nodes("input") if node.attrs.get("name") == "slips")
    assert quantity.attrs.get("value") == "" and "required" in quantity.attrs and quantity.attrs.get("aria-invalid") == "true", "The blank required quantity remains editable and invalid"
    native = native_inputs(idle)
    overrides = {"probMin": "0", "probMax": "30", "teamsMin": "1", "teamsMax": "1", "slips": "1"}
    manual = [(name, overrides.get(name, value)) for name, value in native if name != "markets" or value == "match-result"]
    manual.extend([("picks.match-result", "home-win"), ("picks.total-goals", "under-2.5")])
    selected = inspect(origin, "/en/slips?" + urlencode(manual), directory, "route-native-manual", "generated", 1, selections_per_slip=1)
    row = selected.nodes("li", "data-slip-selection")[0]
    assert row.attrs["data-slip-selection"] == "synthetic-slip-7" and "Home win" in row.text and "20.0%" in row.text and "2.00" in row.text, "Manual Home win uses its own 20% probability and 2.00 price, though Away win was the published top pick"
    assert row.nodes(attr="data-leg-odds")[0].nodes("strong")[0].text == "2.00" and "1.30" not in row.text, "Inline odds retain the manual selection's 2.00 price rather than the top pick's 1.30"
    # Signed-in requests traverse the real route and stored service without offering a save action.
    member_overrides = {"slips": "2", "teamsMin": "2", "teamsMax": "2"}
    member_query = [(name, member_overrides.get(name, value)) for name, value in query if name != "reuse"] + [("reuse", "0")]
    member = inspect(origin, "/member?" + urlencode(member_query), directory, "route-member-build", "generated", 2)
    verify_generated_limits(member, total_min="3", total_max="6", odds_min="1.25", odds_max="2.60",
        prob_min="70", prob_max="100", selections=2, reuse=False)
    tighter = {"slips": "1", "totalMax": "4", "oddsMax": "2", "probMin": "85"}
    regenerated_query = [(name, tighter.get(name, value)) for name, value in member_query]
    regenerated = inspect(origin, "/member?" + urlencode(regenerated_query), directory, "route-member-regenerated", "generated", 1)
    verify_generated_limits(regenerated, total_min="3", total_max="4", odds_min="1.25", odds_max="2",
        prob_min="85", prob_max="100", selections=2, reuse=False)
    exact = {"slips": "1", "totalMin": "1.70", "totalMax": "1.70", "oddsMin": "1.70", "oddsMax": "1.70",
        "probMin": "91", "probMax": "91", "teamsMin": "1", "teamsMax": "1"}
    exact_query = [(name, exact.get(name, value)) for name, value in member_query if name != "markets"] + [("markets", "match-result")]
    exact_build = inspect(origin, "/member?" + urlencode(exact_query), directory, "route-member-exact-bounds", "generated", 1, selections_per_slip=1)
    verify_generated_limits(exact_build, total_min="1.70", total_max="1.70", odds_min="1.70", odds_max="1.70",
        prob_min="91", prob_max="91", selections=1, reuse=False)
    impossible = [(name, "92" if name == "probMin" else "100" if name == "probMax" else value) for name, value in exact_query]
    inspect(origin, "/member?" + urlencode(impossible), directory, "route-member-no-qualifying", "no-qualifying", 0)
    print("Slip rendering verification passed: generation-only for anonymous and signed-in viewers, balanced dialogs, blank Any bounds, native GET builds/cutoff/manual alternatives, regeneration and exact generation limits.", flush=True)


def main():
    args = parse_args("slip builder", extra=("--fixture",))
    if args.fixture:
        directory = Path(args.fixture).resolve()
        assert directory.is_relative_to(ROOT / ".tmp") and (directory / ".next/BUILD_ID").is_file()
    else:
        directory = create_fixture("slips")
        print(f"Building isolated slip fixture: {directory}", flush=True)
        build_fixture(directory, timeout=240)
    with Server(directory) as server:
        verify(server.origin, directory)
        print(f"Fixture artifacts: {directory}", flush=True)
        print(f"Browser case paths: {', '.join('/cases/' + name for name in SCENARIOS)}; native form: /en/slips", flush=True)
        if args.serve:
            server.serve()


if __name__ == "__main__":
    main_guard(main)
