"""Manual owner payments and access in the production chrome with synthetic services only."""
import json
import re
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from lib.rendering import Server, build_fixture, create_fixture, environment, match, no_match, parse_args, request, visible_html
from lib.runtime import ROOT, main_guard


def subscriber_directory(origin):
    response = request(origin, "/admin/subscribers")
    html = visible_html(response.text)
    directory = match(r'<section\b[^>]*data-subscriber-directory[^>]*>([\s\S]*?)</section>', html).group(1)
    match(r'<form\b[^>]*data-subscriber-search', directory)
    match(r'action="/api/admin/subscribers"', directory)
    match("Search by phone", directory)
    match(r'type="tel"', directory)
    match(r'data-subscriber-count', directory)
    assert len(re.findall(r'data-subscriber-row="[^"]+"', directory)) == 6
    assert sorted(re.findall(r'data-subscriber-status="([^"]+)"', directory)) == ["blocked", "erased", "open", "open", "open", "open"]
    for label in ["Open", "Blocked", "Erased", "Last sign-in", "EAT"]:
        match(label, directory)
    no_match(r'Active access|Queued access|days left|passwordHash|tokenHash|ownerNote', directory)
    empty = visible_html(request(origin, "/admin/subscribers?fixture=empty").text)
    match(r'data-subscriber-empty', empty)
    match("No subscriber accounts yet.", empty)
    no_match(r'data-subscriber-row=', empty)
    selected = visible_html(request(origin, "/admin/subscribers?accountId=00000000-0000-4000-8000-000000000100").text)
    row = match(r'<a\b[^>]*data-subscriber-row="00000000-0000-4000-8000-000000000100"[^>]*>', selected).group(0)
    match(r'aria-current="page"', row)
    for query, expected in [("", 6), ("0700000101", 1), ("+256 700 000 204", 1), ("+44 7700 900123", 1), ("256700000999", 0), ("invalid", 0), ("", 6)]:
        outgoing = Request(origin + "/api/admin/subscribers", data=json.dumps({"search": query}).encode(),
            headers={"Content-Type": "application/json", "Sec-Fetch-Site": "same-origin"}, method="POST")
        with urlopen(outgoing, timeout=20) as reply:
            payload = json.loads(reply.read())
            assert reply.status == 200 and len(payload["accounts"]) == expected, (query, payload)
            assert reply.headers.get("Cache-Control") == "no-store"
            for account in payload["accounts"]:
                assert set(account) == {"id", "phone", "status", "lastSignInAt"}
                assert account["status"] in {"open", "blocked", "erased"}
            if query == "+256 700 000 204":
                assert payload["accounts"][0]["status"] == "blocked"
    refused = Request(origin + "/api/admin/subscribers", data=b'{"search":""}',
        headers={"Content-Type": "application/json", "Sec-Fetch-Site": "cross-site"}, method="POST")
    try:
        urlopen(refused, timeout=20)
    except HTTPError as reply:
        assert reply.code == 403
    else:
        raise AssertionError("Cross-site fixture searches must use the production admin guard.")


def main():
    args=parse_args("owner payments",extra=("--fixture",))
    env=environment(GOAL_HINT_DATABASE_ENABLED="false")
    if args.fixture:
        directory=Path(args.fixture).resolve()
        assert directory.is_relative_to(ROOT/".tmp") and (directory/".next/BUILD_ID").is_file(), "Reuse a built acceptance fixture inside .tmp."
    else:
        directory=create_fixture("owner-payments")
        config=directory/"next.config.mjs"
        config.write_text(config.read_text(encoding="utf-8").replace("export default {",'import production from "../../next.config.ts";\nexport default { headers: production.headers,'),encoding="utf-8")
        print(f"Building owner acceptance fixture: {directory}",flush=True)
        build_fixture(directory,env,timeout=300)
    with Server(directory,env,ready="/admin/payments") as server:
        subscriber_directory(server.origin)
        for path,labels in [("/admin/payments",["Subscriber says","Automatic checks","Paste my SMS","Access goes to account","I found this payment in my account","Grant free trial","Dismiss"]),("/admin/codes",["Grant access manually","Extend","Revoke","Phone or P-/C-reference"]),("/admin",["Active paid subscribers","Revenue · EAT week","Payment numbers updated"]),("/admin/subscribers?accountId=00000000-0000-4000-8000-000000000100",["Search by phone","Sign out all devices","Change number","Erase personal data","Save note","Permanently delete account","all related information"]),("/admin/password-resets",["Password requests","generate a temporary password","expire after 15 minutes","Call member","View account"]),("/admin/audit",["code_created","Action","Subscriber"])]:
            response=request(server.origin,path);html=visible_html(response.text)
            assert response.status==200,(path,response.status)
            for label in labels:assert label in html,(path,label)
            assert "no-store" in response.headers.get("Cache-Control","")
            assert "data-analytics-ignore" in html
            for removed in ["#code=", 'href="sms:', 'href="https://wa.me/', "Reissue"]:
                assert removed not in html, (path, removed)
            if path=="/admin/payments":assert "(1) Payments" in response.text
        for action in ["approve", "trial", "manual"]:
            endpoint = "/api/admin/payments/00000000-0000-4000-8000-000000000200" if action == "approve" else "/api/admin/codes"
            outgoing = Request(server.origin + endpoint, data=json.dumps({"action": action}).encode(),
                headers={"Content-Type": "application/json", "Sec-Fetch-Site": "same-origin"}, method="POST")
            with urlopen(outgoing, timeout=20) as reply:
                payload = json.loads(reply.read())
                assert reply.status == 201
                assert reply.headers.get("Cache-Control") == "no-store"
                assert payload["status"] == ("approved" if action == "approve" else "granted")
                assert payload["devicesUnlocked"] == 1 and payload["endsAt"]
                assert not {"delivery", "code", "sms", "whatsapp"}.intersection(payload)
        print("PASS production Payments, access, password requests, Overview, Subscribers and Audit; six directory states, selected/empty rows, normalized phone search, show-all and private grant responses.",flush=True)
        if args.serve:server.serve()
if __name__=="__main__":main_guard(main)
