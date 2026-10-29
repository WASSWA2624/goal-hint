"""Focused Audit acceptance app with synthetic recent and historical audit events."""
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path
import re
import shutil

from lib.rendering import Server, build_fixture, create_fixture, environment, match, parse_args, visible_html
from lib.runtime import ROOT, main_guard


def owner_harness():
    spec = spec_from_file_location("owner_rendering", ROOT / "scripts/verify-owner-payments-rendering.py")
    harness = module_from_spec(spec)
    spec.loader.exec_module(harness)
    return harness


def audit_rendering(harness, origin):
    response = harness.request(origin, "/admin/audit")
    assert response.status == 200 and "no-store" in response.headers.get("Cache-Control", "")
    html = visible_html(response.text)
    match(r"data-audit-report", html)
    match(r"<h1>Audit</h1>", html)
    assert len(re.findall(r"data-floating-field", html)) == 3
    assert re.findall(r'data-audit-event="([^"]+)"', html) == [str(10_000 + index) for index in range(20)]
    for label in ["Any date", "Last hour", "Today", "Last 7 days", "Last 30 days", "Last 3 months", "Last 6 months", "Custom date range"]:
        match(re.escape(label), html)
    for label in ["First page", "Last page", "Previous", "Next", "Page 1 of 5"]:
        match(re.escape(label), html)
    match(r"data-audit-export", html)
    # Historical entries lie outside the default loaded window; the date query must select them first.
    historical = visible_html(harness.request(origin,
        "/admin/audit?period=custom&startDate=2025-01-15&endDate=2025-01-15").text)
    assert re.findall(r'data-audit-event="([^"]+)"', historical) == ["20001", "20000"]
    match(r"2025-01-15", historical)
    match(r"Edit range", historical)
    combined = visible_html(harness.request(origin,
        "/admin/audit?action=payment_approved&period=custom&startDate=2025-01-15&endDate=2025-01-15").text)
    assert re.findall(r'data-audit-event="([^"]+)"', combined) == ["20001", "20000"]
    empty = visible_html(harness.request(origin,
        "/admin/audit?action=member_blocked&period=custom&startDate=2025-01-15&endDate=2025-01-15").text)
    match(r"data-audit-empty", empty)
    payment = visible_html(harness.request(origin,
        "/admin/payments?paymentId=00000000-0000-4000-8000-000000000200").text)
    match(r'data-payment-review="00000000-0000-4000-8000-000000000200"', payment)


def main():
    args = parse_args("admin audit", extra=("--fixture",))
    env = environment(GOAL_HINT_DATABASE_ENABLED="false", GOAL_HINT_ADMIN_PHONES='["256700000991"]',
        GOAL_HINT_ADMIN_PASSWORD="Synthetic owner fixture password", GOAL_HINT_ADMIN_PASSWORD_HASH="")
    if args.fixture:
        directory = Path(args.fixture).resolve()
        assert directory.is_relative_to(ROOT / ".tmp") and (directory / ".next/BUILD_ID").is_file()
    else:
        directory = create_fixture("owner-payments")
        shutil.copytree(ROOT / "tests/helpers/rendering/admin-audit", directory, dirs_exist_ok=True)
        # Extend only this generated fixture's query stub for the production end-exclusive date bound.
        fixture = directory / "app/fixture.ts"
        fixture.write_text(fixture.read_text(encoding="utf-8")
            .replace("gte?: Date; lte?: Date", "gte?: Date; lte?: Date; lt?: Date")
            .replace("&& (!where?.at?.lte || row.at <= where.at.lte)",
                "&& (!where?.at?.lte || row.at <= where.at.lte) && (!where?.at?.lt || row.at < where.at.lt)")
            .replace("paymentSubmission: { findMany:",
                "paymentSubmission: { findUnique: async ({ where }: { where: { id: string } }) => { "
                "const row = state.payments.find(payment => payment.id === where.id); "
                'return row ? { purpose: "plan", ...row, account: { phone: phoneFor(row.accountId), creditUgx: 0 } } : null; }, findMany:'), encoding="utf-8")
        config = directory / "next.config.mjs"
        # Application types are checked separately; this isolated build verifies rendered production components.
        config.write_text(config.read_text(encoding="utf-8").replace("export default {",
            'import production from "../../next.config.ts";\nexport default { headers: production.headers, typescript: { ignoreBuildErrors: true },'), encoding="utf-8")
        print(f"Building Audit acceptance fixture: {directory}", flush=True)
        build_fixture(directory, env, timeout=300)
    harness = owner_harness()
    with Server(directory, env, ready="/api/fixture/health") as server:
        audit_rendering(harness, server.origin)
        print("PASS Audit production rendering, compact floating filters, first/last controls and historical EAT date queries before the loaded-window limit.", flush=True)
        if args.serve:
            print(f"Audit browser entry: {server.origin}/api/fixture/session?page=audit", flush=True)
            server.serve()


if __name__ == "__main__":
    main_guard(main)
