"""Build the real slip UI against isolated synthetic stored records and verify anonymous SSR markup."""
from html.parser import HTMLParser
import re
from urllib.parse import urlencode

from lib.rendering import Server, build_fixture, create_fixture, parse_args, request, visible_html
from lib.runtime import main_guard


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


SCENARIOS = {
    "generated": ("generated", 3), "idle": ("idle", 0), "no-qualifying": ("no-qualifying", 0),
    "no-combinations": ("no-combinations", 0), "odds-unavailable": ("odds-unavailable", 0),
    "data-unavailable": ("data-unavailable", 0), "rate-limited": ("rate-limited", 0),
    "limited": ("generated", 3), "long-names": ("generated", 3),
    "manual-home-win": ("generated", 1),
}

CRITERIA_GROUP_FIELDS = {
    "limits": ["oddsMin", "oddsMax", "probMin", "probMax"],
    "kickoff": ["dateFrom", "dateTo", "timeFrom", "timeTo"],
    "markets": [],
}


def criteria_groups(document, path, error_group=None):
    groups = document.nodes("details", "data-slip-criteria-group")
    assert len(groups) == 3, f"{path}: three native criteria accordions"
    by_name = {group.attrs["data-slip-criteria-group"]: group for group in groups}
    assert set(by_name) == set(CRITERIA_GROUP_FIELDS), f"{path}: limits, kickoff and markets groups"
    summaries = {}
    for name, group in by_name.items():
        assert ("open" in group.attrs) == (name == error_group), f"{path}: {name} starts closed unless invalid"
        summary = [child for child in group.children if isinstance(child, Element) and child.tag == "summary"]
        assert len(summary) == 1 and summary[0].text.strip(), f"{path}: native {name} summary"
        summaries[name] = summary[0].text
        inputs = group.nodes("input")
        for field in CRITERIA_GROUP_FIELDS[name]:
            controls = [node for node in inputs if node.attrs.get("name") == field]
            assert len(controls) == 1 and "disabled" not in controls[0].attrs, f"{path}: {name} keeps enabled native {field}"
            assert len([node for node in document.nodes("input") if node.attrs.get("name") == field]) == 1, f"{path}: no duplicated {field}"
        assert all("disabled" not in fieldset.attrs for fieldset in group.nodes("fieldset")), f"{path}: collapsing {name} does not disable native submission"
    markets = [node for node in document.nodes(attr="data-criteria-field") if node.attrs["data-criteria-field"] == "markets"]
    assert len(markets) == 1 and markets[0] in by_name["markets"].nodes(), f"{path}: market toggles and outcomes share their own accordion"
    targets = [node for node in document.nodes(attr="data-criteria-field") if node.attrs["data-criteria-field"] == "targets"]
    assert len(targets) == 1 and all(targets[0] not in group.nodes() for group in groups), f"{path}: essential slip targets always stay visible"
    for name in ["slips", "totalMin", "totalMax", "teamsMin", "teamsMax"]:
        controls = [node for node in targets[0].nodes("input") if node.attrs.get("name") == name]
        assert len(controls) == 1 and "disabled" not in controls[0].attrs, f"{path}: one enabled essential target {name}"
    inputs = document.nodes("input")
    reuse = [node for node in inputs if node.attrs.get("name") == "reuse"]
    choices = markets[0].nodes("input")
    assert reuse and choices and min(inputs.index(node) for node in reuse) > max(inputs.index(node) for node in choices), f"{path}: match reuse follows Markets in native keyboard order"
    return summaries


def inspect(origin, path, directory, name, expected_state, expected_slips, selections_per_slip=2, error_group=None):
    response = request(origin, path)
    assert response.status == 200, f"{path}: status {response.status}"
    assert response.headers.get("set-cookie") is None, f"{path}: no visitor cookie"
    (directory / f"{name}.html").write_text(response.text, encoding="utf-8")
    document = Document(response.text).root
    assert len(document.nodes("h1")) == 1, f"{path}: one page heading"
    assert len(document.nodes("main")) == 1, f"{path}: one main landmark"
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
    rows = document.nodes("tr", "data-slip-selection")
    if expected_slips:
        assert len(rows) == expected_slips * selections_per_slip, f"{path}: one row per selection"
        for slip in slips:
            headers = slip.nodes("header")
            assert len(headers) == 1 and len(headers[0].nodes("h3")) == 1, f"{path}: slip title header"
            assert len(headers[0].nodes(attr="data-slip-summary")) == 1, f"{path}: summary inside slip title header"
            summary = headers[0].nodes(attr="data-slip-summary")[0].text
            assert "%" in summary and re.search(r"\d+\.\d{2}", summary), f"{path}: title odds and average probability"
            assert re.search(rf"{selections_per_slip}\s+selections?\b", summary), f"{path}: selection count in title summary"
            assert len(slip.nodes("tbody")) == 1 and len(slip.nodes("tr", "data-slip-selection")) == selections_per_slip, f"{path}: classic table slip"
            assert len(slip.nodes("tbody")[0].nodes("tr")) == selections_per_slip, f"{path}: no extra rows inside a match table"
        for row in rows:
            assert "Synthetic" in row.text and "%" in row.text, f"{path}: real synthetic selection details"
            assert re.search(r"\d+\.\d{2}", row.text), f"{path}: selection price"
            pick = next(cell for cell in row.nodes("td") if cell.attrs.get("data-column") == "selection")
            labels = pick.nodes(attr="data-pick-selection")
            assert len(labels) == 1 and not re.fullmatch(r"[12Xx]+|Yes|No", labels[0].text), f"{path}: one generic full-word prediction"
            assert not re.search(r"\b(?:1X2|BTTS|O/U)\b", pick.text), f"{path}: full market names on every screen"
            prices = pick.nodes(attr="data-pick-odds")
            assert len(prices) == 1 and re.fullmatch(r"\(\d+\.\d{2}\)", prices[0].text), f"{path}: own price appears once in brackets beside its pick"
            assert len(row.nodes(attr="data-pick-odds")) == 1, f"{path}: selection odds are not duplicated in another column"
            assert {node.attrs["data-team-side"] for node in row.nodes(attr="data-team-side")} == {"home", "away"}, f"{path}: both team names retain separate mobile lines"
            assert not row.nodes(attr="data-result-badge"), f"{path}: slips do not invent a result absent from their saved selections"
        assert "Average match probability" in document.text, f"{path}: average is identified correctly"
        assert "not the chance that every selection wins" in document.text, f"{path}: mean is distinguished from joint probability"
    else:
        assert not rows and not document.nodes("tbody"), f"{path}: no invented selections in empty/unavailable states"
        assert "Synthetic Home" not in document.text, f"{path}: no synthetic selections leaked into production-like idle state"
    assert 0 <= response.text.find("data-styled=") < response.text.find("<main"), f"{path}: initial styles before content"
    print(f"PASS slip SSR: {name} ({expected_state}, {expected_slips} slips)", flush=True)
    return document


def native_inputs(document):
    """Successful native form controls, preserving repeated checkbox keys and the hidden reuse=0 value."""
    form = next(node for node in document.nodes("form") if node.attrs.get("action") == "/en/slips")
    fields = []
    for node in form.nodes("input"):
        name = node.attrs.get("name")
        if not name or "disabled" in node.attrs or node.attrs.get("type") in ("button", "submit", "reset"):
            continue
        if node.attrs.get("type") in ("checkbox", "radio") and "checked" not in node.attrs:
            continue
        fields.append((name, node.attrs.get("value", "")))
    return fields


def verify(origin, directory):
    for scenario, (state, count) in SCENARIOS.items():
        document = inspect(origin, f"/cases/{scenario}", directory, scenario, state, count,
            selections_per_slip=1 if scenario == "manual-home-win" else 2)
        if scenario == "limited":
            assert "search reached its limit" in document.text and "Fixture coverage is incomplete" in document.text, "Source and search limits remain visible"
    idle = inspect(origin, "/en/slips", directory, "route-idle", "idle", 0)
    query = [
        ("dateFrom", "2026-10-13"), ("dateTo", "2026-10-19"), ("timeFrom", ""), ("timeTo", ""),
        ("markets", "match-result"), ("markets", "total-goals"), ("markets", "both-teams-to-score"),
        ("totalMin", "3.00"), ("totalMax", "6.00"), ("oddsMin", "1.25"), ("oddsMax", "2.60"),
        ("probMin", "70"), ("probMax", "100"), ("teamsMin", "2"), ("teamsMax", "4"),
        ("slips", "3"), ("reuse", "0"), ("reuse", "1"), ("build", "1"),
    ]
    generated = inspect(origin, "/en/slips?" + urlencode(query), directory, "route-build", "generated", 3)
    initial_summaries = criteria_groups(generated, "/en/slips?build=1")
    for group, changes in [
        ("limits", {"oddsMin": "1.50", "oddsMax": "2.50", "probMin": "75", "probMax": "90"}),
        ("kickoff", {"dateTo": "2026-10-15", "timeFrom": "12:30", "timeTo": "18:00"}),
    ]:
        changed = [(field, changes.get(field, value)) for field, value in query]
        draft = inspect(origin, "/en/slips?" + urlencode(changed), directory, f"route-{group}-summary", "generated", 3)
        assert criteria_groups(draft, f"{group} draft")[group] != initial_summaries[group], f"{group} summary reflects changed native draft values"
    chosen_query = query + [("picks.match-result", "home-win")]
    chosen = inspect(origin, "/en/slips?" + urlencode(chosen_query), directory, "route-market-summary", "generated", 3)
    assert "1 with chosen results" in criteria_groups(chosen, "manual market summary")["markets"], "Market summary distinguishes manual results from Automatic"
    no_markets = [(name, value) for name, value in query if name != "markets"]
    invalid_markets = inspect(origin, "/en/slips?" + urlencode(no_markets), directory, "route-invalid-markets", "idle", 0, error_group="markets")
    assert "Select at least one market" in invalid_markets.text, "No-market validation opens the market controls"
    invalid_outcomes = query + [("picks.match-result", "yes")]
    invalid_pick = inspect(origin, "/en/slips?" + urlencode(invalid_outcomes), directory, "route-invalid-outcomes", "idle", 0, error_group="markets")
    assert "Choose Automatic or valid results" in invalid_pick.text, "Invalid manual results open the same market group"
    cutoff = inspect(origin, "/cutoff?" + urlencode(query), directory, "route-cutoff", "generated", 3)
    assert all(row.attrs["data-slip-selection"] != "synthetic-slip-1" for row in cutoff.nodes("tr", "data-slip-selection")), "The route passes the fresh completion clock through to its stored build service"
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
    row = selected.nodes("tr", "data-slip-selection")[0]
    assert row.attrs["data-slip-selection"] == "synthetic-slip-7" and "Home win" in row.text and "20.0%" in row.text and "2.00" in row.text, "Manual Home win uses its own 20% probability and 2.00 price, though Away win was the published top pick"
    assert row.nodes(attr="data-pick-odds")[0].text == "(2.00)" and "1.30" not in row.text, "Inline odds retain the manual selection's 2.00 price rather than the top pick's 1.30"
    print("Slip rendering verification passed: compact native accordions, draft summaries, validation expansion, 10 isolated states and native GET builds/cutoff/manual alternatives.", flush=True)


def main():
    args = parse_args("slip builder")
    directory = create_fixture("slips")
    print(f"Building isolated slip fixture: {directory}", flush=True)
    build_fixture(directory)
    with Server(directory) as server:
        verify(server.origin, directory)
        print(f"Fixture artifacts: {directory}", flush=True)
        print(f"Browser case paths: {', '.join('/cases/' + name for name in SCENARIOS)}; native form: /en/slips", flush=True)
        if args.serve:
            server.serve()


if __name__ == "__main__":
    main_guard(main)
