"""Serve real builder/account/configuration services with isolated synthetic account storage."""
import json
from lib.rendering import Server, build_fixture, create_fixture, local_origin, match, parse_args, request, visible_html
from lib.runtime import main_guard


def verify(origin):
    headers = {"Cookie": "goal-hint-member=" + "a" * 43, "Sec-Fetch-Site": "same-origin"}
    builder = request(origin, "/en/slips", headers=headers)
    assert builder.status == 200
    html = visible_html(builder.text)
    filters = match(r'<dialog\b[^>]*data-slip-criteria-group="advanced"[^>]*>[\s\S]*?</dialog>', html).group()
    row = match(r'<div\b[^>]*data-saved-filters-row="[^"]*"[^>]*>[\s\S]*?<button\b[^>]*data-saved-filters-trigger="[^"]*"[^>]*>[\s\S]*?</button>', filters).group()
    match(r'<button\b[^>]*data-saved-filter-select="[^"]*"[^>]*role="combobox"[^>]*>[\s\S]*?Saved filters', row)
    assert html.count("data-saved-filters-trigger") == 1 and ">Manage</button>" in row, "The sole Manage action is beside the Saved filters dropdown."
    assert "data-saved-slip-configurations" not in builder.text, "Preset management stays in its closed dialog."
    assert 'data-slip-state="idle"' in builder.text, "A fresh builder must not generate slips."
    account = request(origin, "/en/account", headers=headers)
    assert account.status == 200 and "data-saved-slip-configurations" not in account.text
    assert 'id="saved-slip-configurations"' not in account.text, "Management belongs only in Slip Builder."
    collection = request(origin, "/api/account/slip-configurations", headers=headers)
    assert collection.status == 200 and len(json.loads(collection.text)["configurations"]) <= 10
    assert request(origin, "/api/account/slip-configurations", headers={"Sec-Fetch-Site": "same-origin"}).status == 403
    print("Builder/account SSR, private collection and idle generation checks passed.", flush=True)


def main():
    args = parse_args("saved Slip Builder configurations", ("--origin",))
    if args.origin:
        verify(local_origin(args.origin))
        return
    directory = create_fixture("slip-configurations")
    # Production source is checked by npm run typecheck. Avoid a second full-source
    # typecheck inside the small browser fixture on memory-constrained hosts.
    config = directory / "next.config.mjs"
    config.write_text(config.read_text().replace("agentRules: false,", "agentRules: false, typescript: { ignoreBuildErrors: true },"))
    build_fixture(directory, timeout=300)
    with Server(directory, ready="/en/slips") as server:
        verify(server.origin)
        if args.serve:
            server.serve()
        else:
            print("Saved configuration acceptance fixture built and served successfully.")


if __name__ == "__main__":
    main_guard(main, "Saved configuration acceptance failed.")
