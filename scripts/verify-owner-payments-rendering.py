"""Owner payments/codes in the production chrome with synthetic services only."""
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
        for path,labels in [("/admin/payments",["Subscriber says","Automatic checks","Paste my SMS","Code goes to","I found this payment in my account","Send free trial","Dismiss"]),("/admin/codes",["Generate a manual code","Reissue","Extend","Revoke","Phone or P-/C-reference"])]:
            response=request(server.origin,path);html=visible_html(response.text)
            assert response.status==200,(path,response.status)
            for label in labels:assert label in html,(path,label)
            assert "no-store" in response.headers.get("Cache-Control","")
            assert "data-analytics-ignore" in html
            if path=="/admin/payments":assert "(1) Payments" in response.text
        print("PASS production owner Payments and Codes, shared guards/chrome and private headers.",flush=True)
        if args.serve:server.serve()
if __name__=="__main__":main_guard(main)
