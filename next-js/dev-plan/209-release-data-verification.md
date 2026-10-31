# 209 — Independent data and release verification

**Historical evidence:** the owner's subsequent
[31 October scope decisions](../docs/implementation-decisions.md#31-october-2026--remaining-work-scope-closure)
resolve the alert/sharing/OTP recommendations and close the release/device group
from active work. Do not carry those items forward. The observations below retain
their actual verification status; tasks 10/11 remain open in the active audit.

Read-only Track C investigation on 31 October 2026 (Africa/Kampala), alongside
the authorised referral-review and phone-polling work. No deployment, configuration
change, migration, message delivery, paid provider request or device installation
was performed. Only this implementation note is owned by this track.

## Actual checks

### Public hosting and administrative access

- Five unauthenticated HTTPS GETs to `https://goalhint.com/`, `/en`,
  `/api/best-slips`, `/.well-known/assetlinks.json` and
  `/.well-known/apple-app-site-association` all redirected to
  `/cgi-sys/suspendedpage.cgi` and returned **HTTP 403 / Account Suspended**, as
  HTML rather than the application/API/association document. The observed body
  sample was 7,492 bytes in each case. This confirms the public availability
  blocker; it does not identify its billing/administrative cause.
- The documented deployment SSH key exists locally. Two bounded, key-only,
  non-mutating SSH checks failed with **exit 255 / authentication rejected**.
  No password fallback, key rotation, restart, repair or upload was attempted.
  The normal `--status` command includes a log tail, so a custom status probe
  was restricted to release metadata/configuration-presence booleans. It could
  not authenticate; no remote secret or application log was read or printed.
- Consequently the active hosted commit, production socket/proxy CIDRs, ingress
  header sanitization, firewall/origin paths, remote migration inventory/grants,
  worker cron/process/log state and live deliveries remain **Unverified**.
  Restore the hosting service and documented administrative access first, then
  perform the [proxy checklist](../docs/registration-referral-security.md#client-address-provenance)
  over every permitted ingress. The suspended hosting response is not an app
  response and cannot qualify the new Node transport or subscription checks.

### Provider account and stored local evidence

- `python scripts/live-status.py` completed its existing policy-gated,
  **quota-free account `/status` read**. It reported readiness with no local
  configuration gaps, an active **Free** API-Football account, **100 requests/day**,
  **0 used that day**, expiry `2027-02-08T00:00:00.000Z`, a 10/minute limit and
  1,241 configured competitions. This establishes the account/status observation
  only. No fixture, player, prediction, odds or result request was dispatched.
- The reported workload has AI, live-detail imports and odds imports disabled;
  odds-display rights are not recorded. Free-plan live polling is disabled by
  existing workload rules. Local `.env.operations` and its operator register
  contain public-rights, freshness, quality and release approval references;
  local web profiles do not. The register was not changed. Reference presence
  and local readiness are not independent proof of provider truth, content
  licences or production qualification.
- Read-only aggregate SQL ran through the approved application database runtime,
  after confirming a loopback, non-demo target. The configured local store has
  **2,074 fixtures labelled `api-football`**, retrieved between
  `2026-10-13T09:29:57.074Z` and `2026-10-18T17:00:44.260Z`. **Zero** fixture rows
  carry `providerUpdatedAt`; **194** have a regulation-verification timestamp.
  The import ledger contains four complete and four failed fixture imports,
  with latest import observation `2026-10-18T21:00:30.402Z`.
- `EvidenceSourceVersion` and `LiveMatchSnapshot` are both empty.
  `ResultProviderObservation` has **943** records, last retrieved
  `2026-10-18T17:00:44.260Z`. Thus this local snapshot supplies no current player
  evidence or live-detail bodies, and retrieval age cannot establish source
  freshness. Provider labels/verification timestamps were observed, not
  independently reconciled against current authoritative fixtures or results.
- Local durable-job metadata ends on 18 October: three successful daily selections,
  40 successful daily-refresh jobs, 42 successful cutoffs, 21 pending refreshes,
  21 pending cutoffs and one failed/one expired refresh. These historical rows
  do not establish a currently operating local or remote runner. The local
  SMS outbox has one queued record from 26 October and no completion for it;
  it was **not dispatched**. No recipient or message payload was inspected.
- The current [API-Football terms](https://www.api-football.com/terms) were reviewed:
  data/update availability is not guaranteed, publication permissions and third-party
  competition/logo rights remain the customer's responsibility, and API access
  is not a blanket publication licence. The [coverage page](https://www.api-football.com/coverage)
  is marked updated 30 October 2026 and expressly varies by season/fixture.
  Those general sources do not qualify Goal Hint's exact leagues, player fields,
  images or redistribution scope. Obtain/reconcile the applicable rights records
  and a bounded, authorised real sample before making those claims.
- Production [performance reads](../src/server/performance/public-performance.ts)
  still pass no evaluation protocol, retaining counts and withholding gated
  metrics. No approval, metric, provider configuration or reporting gate was
  changed. OP-16/17 cohorts, chronological windows, horizons, minimum samples,
  calibration/baseline and public-claim gates remain decisions; stale local data
  and synthetic arithmetic tests cannot qualify predictive performance.

### Android and native-client prerequisites

- `flutter --version --machine` matches the pinned **Flutter 3.44.6**, revision
  `ee80f08bbf97172ec030b8751ceab557177a34a6`, and **Dart 3.12.2** toolchain.
- **13 focused Flutter tests passed** with `--no-pub` across
  `native_invitation_share_test.dart`, `shared_slip_link_test.dart` and
  `shared_slip_platform_test.dart`: document ownership, native payload bounds,
  concurrency, cancellation/failure, canonical links and cold/warm link handling.
  These are simulated platform tests, not installed-device handoffs.
- `flutter analyze --no-pub` completed with **no issues found** (166.5 seconds).
  No APK build or signed-package claim follows from analysis, unit tests or
  cached compiler artifacts.
- Current root Android declarations are AGP **9.0.1**, Kotlin **2.3.20**, Gradle
  **9.1.0**. Their visible version directories are cached. However the installed
  `share_plus` **13.3.1** Android build still requires AGP **8.12.1** and Kotlin
  **2.2.0**; those two version directories are absent from this execution
  environment's visible Gradle cache. The historical transitive dependency
  blocker therefore remains relevant despite newer root plugin declarations.
- A bounded offline Gradle `help` configuration attempt first failed because
  inherited `JAVA_HOME` names a missing Eclipse JDK. A **process-only** override
  to the installed Microsoft JDK 17.0.20 reached Gradle but failed with
  **`java.io.IOException: Unable to establish loopback connection`** before
  dependency qualification. No global Java/Gradle settings, dependency upgrades
  or cache deletions were applied.
- Android SDK platforms 34/35/36, build-tools 35/36 and `adb` exist. A read-only
  device inventory found **zero attached devices**. `android/key.properties`
  is absent and the four signing environment values are incomplete. Existing
  release signing gates correctly require the owner's real signing identity;
  no substitute key was generated or existing app uninstalled.
- **Unverified:** offline dependency resolution after the host loopback issue,
  fresh signed APK packaging/certificate verification, Android installation,
  phone polling inside an installed WebView, native sharing/downloads (including
  large exports), background/reconnect behavior and verified app links. Public
  association documents are additionally blocked by suspended hosting.

## Release integration requirements

The coordinating agent owns integrated migration/build/application checks; this
track did not apply either track's database changes. The web release alone does
not migrate schemas, install narrow DML grants or update workers. Existing
[deployment instructions](../docs/deployment/how-to-deploy.md) record a hosted
MariaDB target and historically broad app privileges; current remote state is
unverified because administrative access failed. Before production rollout:

1. Confirm target/server identity and migration history, take and restore-test
   a private backup, review the new MySQL/MariaDB SQL, preserve applied checksums
   and verify InnoDB/check/FK/trigger enforcement. Test the actual application
   role and migration role separately; do not assume old grants cover new tables.
2. Deploy web and worker code in a controlled sequence against the verified
   schema. Ensure member maintenance invokes supplementary-evidence cleanup
   90 days after final appeal closure, including quiet/no-traffic accounts.
   Qualify repeated retention, account erasure and notification reconciliation
   without sending test messages to real recipients.
3. Verify the actual bounded worker cron, leases, retry/idempotency and delivery
   outcomes separately. The current wrapper runs retention, renewal and bounded
   existing SMS delivery before the live runner; do not drain a real outbox as
   an incidental test. A readiness response or a present cron is not delivery
   evidence. Keep all unperformed release/device checks **Unverified**.

## Recommendations for owner decisions

- **Prediction/result alerts:** start with an optional in-app daily new-prediction
  digest for eligible members, scoped to an explicitly chosen audience. Result
  alerts should require deliberate following/saving of a relevant fixture/slip;
  deduplicate corrections into the same event. Avoid broadcasting every result
  to all accounts. Approve the audience, trigger and opt-in rules first.
- **Individual-prediction sharing:** defer unless requested; if approved, reuse
  immutable branded snapshots and existing recipient access rules rather than
  creating a public bypass or separate personal betting tracker.
- **Shared-page expansion:** keep the current expanded default for recipients;
  ordinary cards stay collapsed. Change only after an explicit owner decision.
- **Performance:** approve a frozen, source/market/horizon-specific protocol and
  reporting windows before gathering/scoring a bounded real cohort; preserve
  counts-only/withheld behavior until its sample and quality gates pass.
- **OTP lifetime:** retain both approved 24-hour purposes now. If shortening is
  desired, decide recovery and account/phone ownership independently after
  checking actual SMS/WhatsApp delivery delay and corresponding UI wording.

No unresolved decision above blocked either independent authorised implementation.

## Independent review of the new referral backend

While Track A was underway, this track read the new [review service](../src/server/members/referral-reviews.ts),
[transfer integration](../src/server/members/referral-review-transfer.ts), exact
restoration path in [access periods](../src/server/members/access-codes.ts) and
[migration](../prisma/migrations/20261031135652_referral_review/migration.sql).
No backend source was edited by this track.

- Reported a purge/appeal race: selecting old closed case IDs then clearing
  evidence without rechecking could erase a newly reopened appeal statement.
  The backend author added bounded case locking and a closedAt recheck to
  purge, with the same case lock before appeal evidence writes. Source was
  re-reviewed after that change; the backend/coordinator owns its genuine
  transaction-interleaving test result.
- Reported missing invitee privacy coverage: erasing the referred participant
  could leave supplementary evidence reachable through the original referral
  ID. The author added inviter/invitee participation lookup and scrubbing before
  identity links are nulled. Source was re-reviewed; integrated erasure tests
  remain part of Track A sign-off.
- The reviewed financial design uses one reversal ledger per exact grant,
  ordered account/grant locks, holder rechecks across transfers and a unique
  compensating grant whose duration equals the actual reversed milliseconds.
  Only earned grants are affected; paid/trial/wallet state is outside those
  mutation paths. No further blocking financial issue was found in that source
  review; this is not a substitute for genuine concurrent transaction tests.
- Flagged administrator clarity when a case's original account differs from
  the grant/current appeal holder after an audited number move. The displayed
  original account must be labelled historically, with the actual affected
  holder identifiable before a decision. The coordinator/backend author owns
  final DTO/UI handling.

## Account notification/privacy regression

Added [focused integration unit tests](../tests/referral-review-notifications.test.mjs)
using the actual review and Account notification services over the shared
transactional in-memory authentication store. All **4 tests passed**, covering:

- Safe review/reversal/restoration notices with controlled reason codes and
  case links; no supplementary evidence, private identities or ledger fields
  in the member feed. Repeated actions and reconciliation do not duplicate notices.
- Persistent read/dismiss state across service instances, deduplication after
  dismissal, and denial of foreign-account and administrator feed mutations.
- The production reward-claim transfer helper moves appeal ownership. Old
  account notices retain only their historical generic message; current holders
  receive case-linked appeal/restoration notices without other identities.
- Account maintenance actually calls evidence purging at final closure plus
  exactly 90 days, preserves immutable decisions/grants/ledger rows, leaves
  reopened appeals intact, and restarts retention after final appeal closure.

The fixture's missing Prisma reversal relation projection is supplied explicitly
inside this new test file; production ownership decisions are unchanged. This
does not claim genuine concurrent SQL behavior or full AccountMove integration.
The combined new tests, existing referral reviews and Account notifications
regression passed **28/28 tests**, with no skips. No external messages were sent.

## Integrated route and privacy review

Read-only review covered the new administrator and member HTTP handlers and
route/page guards, Account review UI and server projections, notification
ownership joins, and both administrator erasure/deletion hooks. Member output
contains controlled reasons, case status/times and appeal eligibility, while
supplementary evidence, administrator actor identities, grant/account references
and other member numbers remain behind the current administrator session.
Erasure scrubs evidence through both reward-holder and inviter/invitee links;
permanent deletion calls that scrub before account/referral/grant identity links
can disappear. No additional confirmed access/privacy flaw was found.

The route and administrator guard regression passed **17/17 tests**, without
skips or external delivery. Independently reproduced an integration defect:
the page/API's `all` status returned no cases, although the same real service
returned an existing case without a status filter. The backend author normalized
that sentinel and added a real-service regression assertion. The coordinating
agent owns final combined verification and browser results.
