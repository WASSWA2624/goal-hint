"""Discover current competitions with one approved, counted provider request."""
import json
import re
import sys
import urllib.error
import urllib.request
from lib.runtime import CommandError, ROOT, main_guard, service


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def main():
    if any(arg != "--write" for arg in sys.argv[1:]):
        raise CommandError("Usage: npm run live:competitions -- [--write]")
    access = service("competition-access", operations=True)
    request = urllib.request.Request(access["origin"].rstrip("/") + "/leagues?current=true", headers={"x-apisports-key": access["key"]})
    try:
        with urllib.request.build_opener(NoRedirect).open(request, timeout=30) as response:
            body = json.load(response)
    except urllib.error.HTTPError as error:
        raise CommandError(f"API-Football returned HTTP {error.code}.") from None
    except (OSError, ValueError):
        raise CommandError("API-Football request unavailable; private diagnostics are withheld.") from None
    try:
        if not isinstance(body["errors"], (dict, list)) or not isinstance(body["response"], list):
            raise ValueError
        if body["errors"]:
            raise CommandError("API-Football rejected the request; check the key and plan.")
        current = []
        for row in body["response"]:
            league = row["league"]
            if type(league["id"]) is not int or league["id"] <= 0 or not isinstance(league["name"], str) or not isinstance(row["seasons"], list):
                raise ValueError
            for season in row["seasons"]:
                if type(season["year"]) is not int or type(season["current"]) is not bool:
                    raise ValueError
            if any(season["current"] for season in row["seasons"]):
                current.append(row)
        ids = sorted({row["league"]["id"] for row in current})
        coverage = sum(any(season["current"] and season.get("coverage", {}).get("predictions") is True for season in row["seasons"]) for row in current)
    except (KeyError, TypeError, ValueError):
        raise CommandError("API-Football returned an unexpected leagues response.") from None
    print(f"{len(ids)} competitions have a current season; {coverage} report provider prediction coverage.")
    if not ids:
        raise CommandError("No current competitions are available on this plan.")
    if len(ids) > access["maximum"]:
        raise CommandError(f"The plan exposes {len(ids)} competitions; the application accepts at most {access['maximum']}.")
    if "--write" not in sys.argv:
        print("Dry run: pass --write to update GOAL_HINT_COMPETITION_IDS in .env.local.")
        return
    target = ROOT / ".env.local"
    source = target.read_text(encoding="utf-8")
    line = "GOAL_HINT_COMPETITION_IDS=" + ",".join(map(str, ids))
    source = re.sub(r"^GOAL_HINT_COMPETITION_IDS=.*$", lambda _: line, source, flags=re.M) if re.search(r"^GOAL_HINT_COMPETITION_IDS=", source, re.M) else source.rstrip() + "\n" + line + "\n"
    target.write_text(source, encoding="utf-8", newline="\n")
    print("Updated GOAL_HINT_COMPETITION_IDS in .env.local; restart the web app and live runner.")


if __name__ == "__main__":
    main_guard(main, "Competition discovery failed; private diagnostics are withheld.")
