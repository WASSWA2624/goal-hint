"""Manual owner payments and access in the production chrome with synthetic services only."""
import json
from urllib.request import Request, urlopen
from lib.rendering import Server, build_fixture, create_fixture, environment, parse_args, request, visible_html
from lib.runtime import main_guard

def main():
    args=parse_args("owner payments")
    directory=create_fixture("owner-payments")
    config=directory/"next.config.mjs"
    config.write_text(config.read_text(encoding="utf-8").replace("export default {",'import production from "../../next.config.ts";\nexport default { headers: production.headers,'),encoding="utf-8")
    env=environment(GOAL_HINT_DATABASE_ENABLED="false")
    build_fixture(directory,env,timeout=300)
    with Server(directory,env,ready="/admin/payments") as server:
        for path,labels in [("/admin/payments",["Subscriber says","Automatic checks","Paste my SMS","Access goes to account","I found this payment in my account","Grant free trial","Dismiss"]),("/admin/codes",["Grant access manually","Extend","Revoke","Phone or P-/C-reference"]),("/admin",["Active paid subscribers","Revenue this EAT week","Payment numbers last changed"]),("/admin/subscribers?accountId=00000000-0000-4000-8000-000000000100",["Search by phone","Sign out all devices","Change number","Erase personal data","Save note"]),("/admin/password-resets",["Password requests","generate a temporary password","expire after 15 minutes","Call member","View account"]),("/admin/audit",["code_created","Action","Subscriber"])]:
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
        print("PASS production manual Payments, access periods, password requests, Overview, Subscribers and Audit; private grant replies contain no activation credentials.",flush=True)
        if args.serve:server.serve()
if __name__=="__main__":main_guard(main)
