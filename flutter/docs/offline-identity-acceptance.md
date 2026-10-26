# Windows offline account isolation acceptance

This synthetic native check closes the remaining browser-only privacy boundary
from [007](../dev-plan/007-platform-builds-and-release.md). It uses the actual
shared offline entry, worker, manifest builder, cookie helpers, login/sign-out
HTTP handlers and member-session verifier. Its session storage/authentication
adapter contains two isolated synthetic accounts. It never loads a private
environment file, connects a real database, sends messages, grants real access,
or changes a production account. It qualifies Windows WebView behavior, not a
deployed production backend or the fixed production Release origin.

Run from `flutter/`. Build one fresh fixture:

```sh
python tool/serve_offline_identity_fixture.py --build-only
```

The helper reports an owned `next-js/.tmp/offline-identity-*` directory. Retain
that directory and its synthetic state file across all phases. Start it:

```sh
python tool/serve_offline_identity_fixture.py --reuse <fixture-directory> --port 3196
```

Use its dedicated `http://offline-identity.localhost:3196` browser origin.
Chromium recognizes the `.localhost` hostname as a secure loopback context; the
helper's listener/readiness still use `127.0.0.1`. No hosts-file, DNS or security
override is required. The distinct hostname isolates the real member cookie
name from the normal development app: changing only a port would not isolate
cookies. The harness refuses the shared `127.0.0.1`/`localhost` origins.
See [W3C secure contexts](https://www.w3.org/TR/secure-contexts/#is-origin-trustworthy),
[RFC 6761 localhost names](https://www.rfc-editor.org/rfc/rfc6761.html#section-6.3)
and [RFC 6265 cookie isolation](https://www.rfc-editor.org/rfc/rfc6265.html#section-8.5).

Run the following native command separately for each phase in the table,
changing only `OFFLINE_IDENTITY_PHASE`. Keep the same origin/profile and use
`--no-uninstall`; never clear application data or copy cookies between stores.

```sh
flutter test integration_test/offline_identity_test.dart -d windows --no-uninstall --dart-define=APP_ENV=development --dart-define=DEV_APP_ORIGIN=http://offline-identity.localhost:3196 --dart-define=OFFLINE_IDENTITY_PHASE=seed-a
```

| Phase | Owned server state | Required proof |
| --- | --- | --- |
| `seed-a` | Running | Anonymous bundle preparation; real HttpOnly-cookie transport for synthetic A; private HTML, RSC and JSON observed online but absent from every owned cache. |
| `cold-a` | Stopped | Separate native process opens only saved public matches; private API and a synthetic POST fail offline. |
| `switch-b` | Running again | Server recognizes A's normal persisted cookie; no offline POST replay occurred. Login changes to B; A is absent from the document, and B's private responses remain outside the anonymous cache. |
| `cold-b` | Stopped | Separate native process still opens only saved public matches despite a retained B session; private API and POST remain unavailable. |
| `logout` | Running again | B's cookie persists normally, with no queued POST replay. Actual sign-out clears both member/legacy cookies and emits its real Clear-Site-Data header. Online anonymous preparation resumes without weakening that header. |
| `cold-logout` | Stopped | Separate native process opens public saved matches after logout; no prior identity, phone, prediction or token appears in the document/cache; no private read or POST succeeds. |
| `cleanup` | Running again | Server verifies the member cookie remains absent after cold reopen, and the synthetic write-attempt counter is still zero. Only this fixture's recognized worker and `goal-hint-offline-*` caches are removed. |

For each stopped phase, stop only this helper's owned server and wait until its
listener exits. Keep the native command from the previous phase fully terminated
before starting the next; root/build/profile equality is not a same-tab check.
Wi-Fi remains available; this models an app-origin outage, not OS radio switching.
For each online phase, restart the same helper/directory at the same port. Its
public synthetic state file persists session revocation and the write-attempt
counter across server restarts. There is no HTTP administration/control endpoint.

The audit checks all recognized app cache URLs against the existing allowlist,
rejects queries/private response policies, and scans every cached response for
both synthetic identities' private sentinels, phone values and token bytes.
The native output contains only phase/PID and pass/fail assertions; it never
prints cookies or private response bodies. Session contents stay in the normal
WebView store; nothing is copied into Dart/native preferences. The generic
WebView JavaScript bridge must remain undefined.
Cold phases also revisit `/en`, the exact URL that contained private HTML while
online, and require the anonymous saved view again. The logout header is verified
with a stateless direct loopback HTTP request, since browser JavaScript did not
expose it as expected in this engine; that request copies no browser cookie.
The real native logout and subsequent cookie absence remain separate assertions.

The write endpoint is a synthetic attempt counter, not an account/payment
mutation. Offline POSTs must fail and must never replay when the server returns.
The fixture uses the current real login HTTP input contract with a synthetic
authentication adapter; it does not validate real password handling, MySQL,
message services or a production account lifecycle.

If an interrupted synthetic run left its own A/B cookie on this dedicated host,
run the optional online `reset` phase before restarting the complete sequence.
It invokes the actual sign-out handler, verifies anonymous responses, then removes
only this fixture's worker/caches. It is setup recovery, not an acceptance pass;
the final `cleanup` phase still requires the cookie to be absent before doing
anything that could clear it.

Stop the final owned server, retain ignored logs/evidence, then rebuild normal
`lib/main.dart` with the development origin on port 3000. The
[native integration guide](../integration_test/README.md) covers the other
offline/reconnection checks. Record actual results and unavailable targets in
[the tracker](../dev-tracker.md); Android device work remains deferred and this
Windows-only check makes no Apple/Linux or production-release claim.

## Actual Windows qualification — 27 October 2026 (EAT)

All seven required phases passed in separate Windows Debug native processes at
`http://offline-identity.localhost:3196`, retaining the normal development WebView
profile. The independently owned website build was `oiqyvIYhG58C1OcAUiIjZ` under
ignored `next-js/.tmp/offline-identity-eaee654d`. The table separates compilation
time from the functional test; these are not startup-performance measurements.

| Phase | Native PID | Build | Test | Result |
| --- | --- | --- | --- | --- |
| `seed-a` | 11760 | 66.5s | 11s | Pass |
| `cold-a` | 38472 | 57.8s | 4s | Pass |
| `switch-b` | 14876 | 61.2s | 13s | Pass |
| `cold-b` | 8260 | 86.3s | 5s | Pass |
| `logout` | 7824 | 65.0s | 11s | Pass |
| `cold-logout` | 36364 | 67.6s | 4s | Pass |
| `cleanup` | 24820 | 86.0s | 8s | Pass |

A/B's ordinary HttpOnly cookies persisted across full native termination and
were recognized by the real session verifier against the synthetic store when
the server returned. Online private JSON/RSC responses were no-store; A/B
private DOM, phones, predictions and token bytes were absent from every owned
cache. Each cold process loaded only public saved matches, including when
revisiting `/en`, the exact URL that held private HTML online. Private API reads
and synthetic POSTs failed while the owned server was stopped; the persisted
write-attempt counter remained zero on every reconnect.

The actual sign-out handler cleared the native member cookie. Its original
Clear-Site-Data header was verified by stateless HTTP, private reads became
401/no-store, and anonymous preparation succeeded again. Strict final cleanup
verified that the cookie was already absent after cold reopen before removing
only this dedicated host's recognized worker and app caches. Final synthetic
state was A/B inactive and writeAttempts zero. Every native host and its owned
browser children exited; the development WebView process count was zero. Only
the verified fixture servers were stopped, and port 3196 had no remaining
listener. Other hosts' cookies/profiles/caches were not cleared.

Initial harness attempts were retained honestly: the shared-127.0.0.1 attempt
was stopped during compilation before a native app/login started. The first
dedicated-host run exposed a test assertion that expected React Flight to join
separate text nodes; the corrected check requires its actual component content
type, private prefix and identity-specific value. A recovery run exposed browser
JavaScript's unexpected Clear-Site-Data header visibility; header verification
moved to stateless raw HTTP while native cookie clearing and every cache/privacy
assertion remained. Its real sign-out completed, and the subsequent strict seed
confirmed anonymous cookie state before login. No production privacy/cache code
was changed to obtain a pass.

The seven final `.dart_tool/windows007-identity-<phase>.log` files each end with
All tests passed. The initial stopped/assertion logs, fixture server logs and
public `.dart_tool/windows007-identity-evidence.json` remain ignored. The evidence
records UTC `2026-10-26T21:24:34Z`, which is 27 October in Africa/Kampala.
These passes qualify the actual Windows native engine with synthetic account
storage; they do not qualify a real database, account backend, suspended deployed
production origin, production Release cache lifecycle, or another platform.
