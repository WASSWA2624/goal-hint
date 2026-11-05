"""Build the real compact Contact page and admin controls with fictional settings."""
import json

from lib.rendering import Server, build_fixture, create_fixture, environment, parse_args, request, visible_html
from lib.runtime import main_guard


def main():
    args = parse_args("contact")
    directory = create_fixture("contact")
    # Replace only the authenticated refresh action inside this synthetic app;
    # the production SettingsEditor and its save protocol remain unchanged.
    config_path = directory / "tsconfig.json"
    config = json.loads(config_path.read_text(encoding="utf-8"))
    config["compilerOptions"]["paths"]["@/app/(owner)/actions"] = ["./app/fixture-actions.ts"]
    config_path.write_text(json.dumps(config, indent=2) + "\n", encoding="utf-8")
    env = environment(GOAL_HINT_DATABASE_ENABLED="false", GOAL_HINT_DEPLOYMENT_ENVIRONMENT="staging")
    print(f"Building contact fixture: {directory}", flush=True)
    build_fixture(directory, env, timeout=360)
    with Server(directory, env, ready="/en/contact") as server:
        response = request(server.origin, "/en/contact")
        assert response.status == 200
        visible = visible_html(response.text)
        assert "support@example.test" in visible and "Customer care" in visible
        assert "Checkout only" not in visible and "Hidden contact" not in visible
        assert "256752123456" not in response.text and "256782123456" not in response.text
        public = request(server.origin, "/api/contact")
        assert public.status == 200 and public.headers.get("cache-control") == "no-store"
        contacts = json.loads(public.text)
        assert contacts["email"] == "support@example.test"
        assert [contact["id"] for contact in contacts["supportContacts"]] == ["public"]
        admin = request(server.origin, "/admin/settings")
        assert admin.status == 200 and "data-settings-editor" in admin.text
        print(f"PASS compact Contact SSR, hidden-contact exclusion and public API. Browser fixture: {server.origin}", flush=True)
        if args.serve:
            server.serve()


if __name__ == "__main__":
    main_guard(main, "Contact rendering failed; inspect the fixture build.log.")
