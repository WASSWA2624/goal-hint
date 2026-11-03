# Goal Hint — Community, Payment Review and Cross-Platform Alerts

**Coding-agent implementation prompt**  
**Prepared: 3 November 2026**  
**Basis:** the owner's discussion and `APP_OVERVIEW(2).md`, reviewed on 3 November 2026.

## 1. Assignment and non-negotiable boundaries

You are working in the existing **Goal Hint** repository. Review the implementation, preserve working functionality, and implement the agreed improvements below. Do not rebuild the app or assume that features described in the overview are missing.

The priorities are:

1. Make the public WhatsApp and Telegram communities easy to find without cluttering the interface.
2. Validate the existing payment, wallet, referral-day and subscription flows against their documented requirements; correct evidenced defects rather than redesigning checkout.
3. Alert authorised payment reviewers promptly, including outside the open app where the platform supports it, and take them directly to the relevant payment.

> **Preserve the current UI. No major layout, navigation, visual-design or workflow change may be implemented without the owner's explicit approval first.** Show the proposed change, reason and affected screens, then pause that part of the work. Continue unrelated, approved work where safe.

Retain the desktop top navigation, mobile bottom navigation and existing **More** menus. Preserve the logo, app name, download control, account controls, theme toggle, responsive behaviour and current menu destinations. Earlier brainstorming about replacing the bottom navigation with a new four- or five-item arrangement was **not approved**.

Use concise British English UI copy. Do not duplicate instructions, actions, balances, notifications or workflow steps. Reuse existing components, settings, services, notifications and documentation. Consolidate cross-cutting fixes instead of implementing the same solution separately in several places.

Keep payment business rules and authorisation in the shared Next.js application. Flutter remains a host for the same experience, with native notification, sound and navigation integration where required. Do not create a second checkout or payment-approval implementation in Flutter.

Do not change prices, package durations, referral eligibility, accounting rules, device limits, prediction logic, subscription protection or unrelated features. Do not upgrade Next.js, Flutter or other major dependencies simply because this prompt mentions them. Read the installed versions first.

## 2. Read and reconcile the existing implementation first

### 2.1 Source-derived baseline

The following is reported by the supplied overview, **not independently verified repository or production behaviour**. [S1]

| Area | Baseline to preserve and validate |
| --- | --- |
| Product | Goal Hint provides football predictions, slip generation and match analysis. Bet placement, stakes and bookmaker payment processing are outside its scope. |
| Architecture | `next-js/` owns screens, APIs, authorisation and business rules, using TypeScript, shared styled-components themes, Redux and Prisma with MySQL/MariaDB support. Flutter hosts the shared experience. |
| Payments | Manual UGX transfers to configured MTN MoMo/Airtel Money wallets; the app handles reporting, evidence, review, reconciliation and activation. Direct payment-provider collection and automatic external-payment confirmation are not implemented. |
| Checkout | **Package → Pay → Details → Review** combines package purchases, wallet contributions and referral days. Wallet/referral-only purchases complete after explicit member confirmation without external receipt review. |
| Approval | Receipt verification and approval are separate actions. Administrators check the actual wallet transaction before approving. |
| Accounting and access | Approval allocates receipts once, spends reserved balances, credits eligible excess and grants/extends access atomically. Renewals preserve remaining time. Top-ups credit the wallet without granting access. |
| Exceptions | Corrections, rejection reasons, disputes, shortfalls, duplicate-receipt controls, reviewer conflicts and audit history already have documented workflows. Legacy reversal and current-checkout reconciliation are distinct. |
| Referrals | An eligible friend's **first phone verification** awards one redeemable day independently of payment. Eight-digit invitation codes and legacy-code compatibility already exist. |
| Notifications | The private inbox already covers payment decisions, access and referrals. YoolaSMS and queued account messaging exist, but external delivery depends on the event, configuration and worker. Current checkout updates are documented as in-app. |
| Sharing | Branded slip-image downloads and sharing already exist. Completed public slips can be shared without a subscription; unfinished selections remain protected. |
| Platform status | Android and Windows have recorded local execution evidence. Apple qualification and Linux browser qualification remain incomplete. Release signing, hosting and deployment approval are separate. |

**Clarifications from the final review:**

- The owner's informal reference to a referral reward at registration must not silently replace the documented **first eligible phone verification** rule.
- The owner reports customer activation messages on their phone. Determine the actual event and delivery channel; do not assume every checkout activation already sends SMS, WhatsApp or push.
- The owner confirms that administrator payment alerts currently become visible only after opening the app. Treat out-of-app reviewer alerts as the improvement to implement, while checking for reusable foundations.
- The overview does not establish exact checkout arithmetic, every payment state, or exact menu ordering. Inspect the repository rather than inventing these details.
- A source-code implementation is not proof of deployment, provider configuration or successful device testing.

### 2.2 Required inspection

Read repository instructions and the actual equivalents of:

- `next-js/docs/payment-checkout.md`
- `next-js/README.md` and `next-js/dev-tracker.md`
- `flutter/dev-tracker.md`
- `next-js/docs/slip-sharing.md`
- Checkout, receipts, wallet/referral ledgers, entitlement, approval, reconciliation and notification code and tests.
- Navigation, existing dialogs/drawers, admin settings, external-link handling, service workers, Flutter bridges, app-link handling and device/session registration.
- Package manifests, deployment configuration and current worker scheduling.

These repository documents were referenced by the overview but were not supplied with this prompt. Read them in the checkout; do not treat their unseen contents as already verified. If a path has moved, locate its current equivalent.

Produce a compact gap assessment with: **requirement → existing code/tests → verified status → necessary change or blocker**. Distinguish implemented, partially implemented, missing, configuration-dependent and untested. Resolve discrepancies explicitly; do not silently invent business rules or overwrite unrelated work.

Then implement the agreed scope. Only pause for a genuine approval gate, unavailable credential or unresolved business-rule conflict—not for routine technical choices delegated to you.

## 3. Community access without a navigation redesign

### 3.1 Entry and presentation

Add one **Community** item near the top of the existing **More** menu on both desktop and mobile. Do not reorder the primary navigation or add a permanent bottom-bar item, floating button, homepage banner or extra header icon.

Open a compact panel using the app's existing dialog/drawer pattern. Use the title **Join our community** and these destinations when configured:

| Destination | Short explanation |
| --- | --- |
| WhatsApp Channel | Results, tutorials and updates |
| Telegram Channel | Results, tutorials and updates |
| WhatsApp Group | Discussion and questions |

Keep descriptions optional when labels already make the destination clear. Use existing icon styling, spacing, themes, focus handling and close/back behaviour. Ensure labels remain readable on small phones without horizontal overflow.

Community access is public: visitors, trial users, active subscribers, expired subscribers and administrators can use it. Do not require registration, an active subscription or payment to open these links. This does not change access to protected predictions or unfinished slips.

### 3.2 Configuration and links

Extend existing admin settings with a small community-link section. Store each destination's type, URL and enabled state using the existing configuration mechanism. Restrict edits to the appropriate administrators.

Allow links to be changed or hidden without rebuilding native apps. Validate HTTPS destinations and the intended platform; reject unsafe schemes. Do not invent live URLs or ship public dummy links. Hide unconfigured/disabled destinations, and hide the public Community entry when none is available.

Reuse existing external/app-link handling. Open the relevant installed app where supported, otherwise use a safe browser fallback. Keep users able to return to Goal Hint; do not navigate its authenticated WebView to arbitrary external content or expose its native bridge to it. Do not auto-join groups or import contacts.

**Community is separate from Invite a friend.** Preserve the existing referral entry, sharing links, codes and rewards. Visiting a community link must not create referral rewards or imply that joining a channel earns access.

### 3.3 Content boundary

The owner intends to share results, slip images, tutorials, videos, audio and app updates manually to support onboarding and renewal. Reuse the existing slip-sharing feature; do not build a second exporter, social feed, content-management system, scheduled posting service or messaging bot.

Keep shared results accurate. Preserve original picks, odds and outcomes. Do not relabel average selection probability as the chance that the entire slip wins, or imply guaranteed future wins. [S1, “Access and everyday use”]

## 4. Validate payments before changing them

Treat this as an evidence-based review of existing functionality, followed by targeted fixes. Build tests against `payment-checkout.md` and the real state machine rather than creating parallel rules.

| Review area | Required validation |
| --- | --- |
| Package and payment summary | The selected package, wallet contribution, external amount due, referral days and resulting access are clear and consistent. Money and time are not confused. Derive exact arithmetic and eligibility from the detailed payment specification; do not turn conversational examples into new rules. |
| Wallet/referral-only checkout | Explicit member confirmation is required. No irrelevant external-payment instructions, receipt upload or manual receipt review is required when no external money is due. Do not generate a new external-payment review alert for these completed purchases. |
| External payment reporting | Current recipient and provider details are correct. Required transaction details and evidence are collected once. OCR assists entry only; screenshots, copied messages and client claims never prove receipt of funds. |
| Receipt verification | Check provider, transaction ID, amount, recipient, time, sender, ownership and sufficient funding against the actual wallet record. Preserve separate verification and approval actions and existing conflict controls. |
| Approval and concurrency | Repeated requests, double taps, retries or simultaneous reviewers cannot allocate the same receipt, debit credits or extend access twice. State and balances remain consistent after partial failures. |
| Renewals and top-ups | Existing unexpired access is preserved. Confirm the documented expiry arithmetic. A standalone top-up affects wallet credit, not subscription time. |
| Exceptions | Validate corrections, rejection reasons, ownership disputes, shortfalls, eligible excess, cancellation/reservation release where defined, legacy reversals and current reconciliation. Do not replace these with a generic approve/reject shortcut. |
| Member updates | After approval, signed-in pages refresh access and expiry without activation-code entry. Show the true pending/correction/rejected/activated state using existing terminology and components. |
| Messaging | Trace existing event templates, outbox/queue and workers. Verify actual in-app and configured external delivery, consent and failure handling. Do not create duplicate activation messages or silently add paid SMS/WhatsApp fallbacks. |
| Referral and access controls | Preserve first-verification reward eligibility, anti-abuse safeguards, redemption and server-verified entitlement. Community access must not bypass subscription checks. |

Keep the existing checkout arrangement unless a demonstrated defect cannot be corrected locally. Where necessary, remove redundant text or irrelevant steps without hiding material payment information or changing accounting semantics.

Do not promise instant activation or publish a review-time guarantee that has not been operationally established. Concise states such as **Awaiting review**, **Correction needed** and **Activated** may be used only where they accurately map to existing states.

## 5. Payment-review alerts and direct navigation

### 5.1 Trigger and reviewer journey

The desired flow is:

**Member submits an external payment report → server saves it as awaiting review → authorised reviewer receives an alert → one tap opens that exact payment → reviewer verifies the actual receipt and approves → the existing transaction activates/extends access → the customer sees the updated status and configured confirmation.**

The trigger is a successfully committed, actionable payment report—not opening checkout, uploading an unfinished screenshot or merely transferring money outside the app. Without provider integration, the application cannot independently know that a transfer occurred before it is reported.

Generate a further review event only when a meaningful correction/resubmission genuinely requires another decision under the existing workflow. Ordinary edits, refreshes and retries must not repeatedly sound as new payments.

Retain the existing admin inbox and pending queue. Add delivery channels to the same canonical event rather than inventing another payment dashboard or notification centre.

### 5.2 One tap means open the correct review, not approve blindly

Notification text should be compact, for example:

- **Title:** Payment awaiting review
- **Body:** Open to review this payment.
- **Action, where supported:** Review payment

Use an internal identifier and the existing canonical review route. Do not expose screenshots, full phone numbers, transaction messages, credentials or financial details on lock screens or in push payloads.

Handle foreground, background and cold-start taps. If authentication is required, preserve a validated internal return destination and open it after successful sign-in. Recheck reviewer permission and fetch the current payment state from the server before displaying evidence or actions.

A stale alert for a resolved payment must show its current state, not offer another activation. Offline taps may retain the navigation intent and show a concise connection state; payment approval still requires connectivity.

Do not put **Activate** on an unauthenticated notification action. Do not merge receipt verification and final approval merely to save a tap. Viewing or dismissing an alert is not a payment decision.

### 5.3 Durable server-side delivery

Reuse existing notification events, queues and workers. Where missing, add a durable outbox entry in the same database transaction as the actionable payment state, then deliver asynchronously with bounded retries and backoff.

Use stable event IDs, payment/revision references and per-endpoint deduplication. Make submission and approval endpoints idempotent. A messaging-provider failure must not lose a submitted payment, undo a valid approval or hold checkout open waiting for remote delivery.

Register delivery endpoints against authenticated users/devices on the server. Check current reviewer permissions before sending. Refresh rotated tokens, remove invalid endpoints and detach delivery when the user logs out, loses the role or has the associated session/device revoked. Normal app backgrounding or closing is not logout. Preserve existing session/device-limit rules.

Keep push credentials server-side, protect subscription/token endpoints, and avoid public broadcast topics for private review events. Log delivery attempts and failures without logging secrets or raw evidence. Provider acceptance is not proof that the administrator heard or opened the alert.

Use the existing real-time/update mechanism for open clients. A foreground polling loop is not a substitute for out-of-app push. Check the actual worker cadence and hosting constraints; a slow cron interval must not be described as immediate delivery.

### 5.4 Synchronisation and duplicate control

On review or approval, refresh pending counts and payment state across connected clients. Cancel app-controlled repeats and remove/update obsolete local notifications where supported; reconcile on resume when background removal is unavailable.

Within each Flutter host, choose **one notification owner: the native layer**. Suppress the embedded page's matching sound and browser push registration. Avoid duplicate display from an OS-rendered push plus a second locally generated notification.

Coordinate multiple tabs of the same browser profile so one event does not produce several sounds. Deduplicate retry delivery with persisted event state where practical.

Separate browser profiles and a separately installed native client may be independent endpoints. Do not use device fingerprinting or claim universal physical-device deduplication. Prefer native alerts inside the shell and use existing per-device settings to let an administrator silence a redundant standalone browser endpoint. Different authorised devices may each receive an alert.

## 6. Delivery and sound: selected technical approach

These are **implementation choices and platform constraints**, not claims about features already in Goal Hint. Official technical references are listed in Section 10. Verify compatibility with the repository's actual packages and deployment model.

Implement web, Android and the supported Windows shell as one coordinated scope. Do not arbitrarily postpone desktop work. Where credentials, packaging or test hardware block a capability, complete the safe integration and report that exact limitation rather than claiming universal support.

### 6.1 Platform delivery

| Platform/state | Required implementation and honest fallback |
| --- | --- |
| Standalone browser, page active | Reuse the live event feed and existing in-app notification. Play the custom tone only after the administrator enables sound through a user gesture and playback is permitted. A blocked sound must not block the visual alert. [T1] |
| Standalone browser, page backgrounded/closed | Use supported Web Push with a service worker, HTTPS and permission. Request normal system notification behaviour; sound may be the device default or silent. Do not rely on a custom background sound or a page timer. Browser/OS restrictions still apply. [T2–T3] |
| Flutter Android | Reuse an existing suitable push integration; otherwise use Firebase Cloud Messaging with native notification handling. Use a dedicated **Payment reviews** channel and a locally bundled sound. Handle permission, foreground delivery, background delivery and notification taps on cold start. [T4–T6] |
| Flutter Windows | Integrate native Windows notifications and compatible local audio resources. Use a qualified Windows push transport, normally WNS/Windows App SDK integration where the actual host permits it, for delivery while the process is closed. Verify identity, registration, packaging and activation requirements. Local notifications plus a live socket cover a running/minimised process only; they do not establish closed-process delivery. [T7–T8] |
| Apple/Linux targets | Inspect any targets actually maintained in the repository. Provide compatible adapters where support and test evidence exist, but do not advertise them as qualified based on this prompt. The overview identifies existing qualification gaps. For iPhone/iPad web use, check Home Screen installation and permission requirements rather than assuming ordinary browser-tab support. [S1; T9] |

Default to standards-based Web Push for browsers and FCM for Android when no existing qualified integration is reusable. Keep platform transports behind the shared event-delivery contract. Do not move payment logic into Firebase or assume an Android messaging plugin supplies Windows push support.

If Windows background integration requires new deployment identity or packaging work that changes the distribution arrangement materially, document the requirement and obtain approval for that change. Do not secretly add an always-running daemon, startup task or background polling service.

Permission denial, Do Not Disturb, muted channels, connectivity loss and platform restrictions must degrade safely to the existing inbox/queue. In particular, an Android app force-stopped in device settings must be reopened before FCM delivery resumes. Do not attempt to bypass that restriction or use alarm/call behaviour for payment alerts. [T4]

### 6.2 One lightweight sound asset, not a long recorded sequence

Provide one short, distinctive, original or appropriately licensed chime. Do not copy WhatsApp's sound. The owner's “ta-ta” and “ten times” were examples, not mandatory sound content or a repeat count.

Use a single master sound and only the platform-specific encodings/resource copies actually needed. Aim for roughly one second and a small asset, preferably under 100 KB per delivered encoding, subject to sound quality and platform compatibility. Record its duration, size and provenance.

Bundle native copies with the Flutter releases and package them as valid OS notification resources; a Flutter asset entry alone may not satisfy a native sound API. Native playback must not depend on downloading an audio file when a payment arrives. Serve a versioned, same-origin, cacheable web copy through the existing hosting. Do not cache private payment responses alongside it.

For app-controlled foreground playback, keep asset, repeat count and gap separate. **Default: one short playback per new review event.** Permit a small validated repeat count through the existing configuration pattern, with a documented conservative cap. Reuse the short asset rather than exporting a long repeated recording.

Stop app-controlled repeats when the alert is opened/dismissed, the payment is resolved, or the relevant session ends. Prevent overlapping repeat loops and noisy catch-up storms after reconnecting. Keep every payment visible in the queue even when audio is coalesced.

For background OS notifications, use supported native custom audio or the normal system fallback. Do not promise exact repeat counts, loop background audio indefinitely or override user sound settings. Android channel behaviour is user-controlled after creation; do not repeatedly recreate channels to defeat preferences. Windows custom notification audio must use supported resource sources, not an arbitrary hosted URL. [T5; T7]

### 6.3 Minimal controls and permission UX

Reuse an existing admin settings/device section for **Payment alerts**, permission/registration status, an enable/mute control and **Test alert** or **Test sound**. Offer a short route to OS settings when necessary. Keep advanced transport and repeat configuration out of ordinary customer screens.

Request permissions after an explicit administrator action, not on every page load or for every visitor. Do not repeatedly prompt after refusal. Operational reviewer notifications and customer marketing consent are separate.

The test must exercise the real delivery path on the selected device without creating a payment or granting access. Distinguish queued, provider-accepted, displayed and opened states wherever observable. Do not label a token registration or local beep as proof of background push delivery.

## 7. Scope exclusions and future payment APIs

Do not implement payment-provider collection, automatic verification from SMS/screenshots, new payment gateways, automatic social publishing, referral redesign, paid-admin staffing tools or broad marketing automation in this task.

Manual external-payment verification remains authoritative. Keep the existing payment domain reusable so a future verified provider event can enter the proper reconciliation/activation path, rather than duplicating subscription logic. Do not add speculative API integrations or change manual approval rules now.

The initial market remains Uganda with the existing payment configuration. Do not block eligible overseas users from public community access, but do not invent international payment methods, supported currencies or cross-border availability.

Do not introduce paid notification services, automatic SMS/WhatsApp escalation or new recurring costs without approval. Record required provider accounts, credentials, operational dependencies and any known costs instead of assuming hosting a sound file is sufficient for push delivery.

## 8. Acceptance tests and evidence

Extend existing tests and run the relevant checks. Use a sandbox/test environment and test accounts; do not approve real receipts or change real entitlements during testing. Record actual devices, OS/browser versions, build identifiers and observed results.

| Test group | Minimum evidence |
| --- | --- |
| UI preservation | Before/after views at narrow mobile, tablet and desktop widths, in both themes. Existing navigation, account/download controls and page behaviour remain intact. |
| Community | Visitor, trial, active, expired and admin access; enabled/disabled/unconfigured links; valid external opening, missing target app and return navigation; no invented links or referral side effects. |
| Payment regression | Each applicable check in Section 4, including money/time-only cases, receipt reuse, concurrency, renewals, top-ups, corrections, insufficient funding and audit history. |
| Alert trigger | Committed external report creates one logical review event. Failed submissions, refreshes and wallet/referral-only completion do not. Meaningful resubmission follows the existing state machine. |
| Permission/security | Granted, denied and later-revoked permission; non-reviewer cannot register for private alerts; revoked role/logout/session replacement disables the relevant endpoint; payloads reveal no private evidence. |
| Web lifecycle | Active tab, background tab, closed site, multiple tabs, notification click, expired authentication and blocked autoplay. Test fully exited browser behaviour separately and state any limitation. |
| Native lifecycle | Android and Windows active, background/minimised, normal process termination/cold start and locked-device behaviour. Test Android force-stop separately; do not mislabel expected restrictions as working push. |
| Sound | Packaged asset plays without a fresh asset download; selected fallback works; foreground repeat limits and cancellation work; no WebView/native double alert or overlapping catch-up loops. |
| Direct review | Each notification opens its own payment. Auth restoration retains a safe destination. Resolved, unauthorised and offline cases remain safe. Opening does not approve. |
| Reliability | Worker restart, network outage, provider failure, token rotation, duplicate delivery, stale/out-of-order events and competing reviewers do not lose payments or duplicate financial effects. |
| Cross-device updates | Approval refreshes connected clients and the customer's entitlement. Obsolete alerts are reconciled where possible; notification failures do not roll back activation. |
| Regression boundaries | Slip sharing, invitation links, protected content, offline cache boundaries and existing session limits remain unchanged. |

Measure the healthy-path time from report commit to dispatch, observable receipt/display, opening the review and approval-to-customer refresh. Record actual timing and worker cadence. Optimise avoidable delays; do not manufacture a delivery or activation SLA from a single test.

Use **Passed**, **Failed**, **Blocked** and **Not tested** accurately. A mock test, successful build or registered push token is not a real-device background-delivery pass. Apple/Linux gaps must remain explicit where qualification is unavailable.

## 9. Implementation order, rollout and handover

Work in this order: inspect and record gaps; implement the small Community addition; apply necessary payment fixes; integrate the shared review event and platform adapters; add sound/deep-link coordination; test; update the existing documentation and trackers.

Reuse existing schemas and delivery infrastructure before adding new ones. Introduce only necessary, backward-compatible migrations and configuration. Respect uncommitted work; avoid destructive database operations and broad refactors.

Document secure server credentials, HTTPS/service-worker requirements, native registration/identity requirements, resource packaging, workers, allowed origins and required rebuilds. Coordinate the web, worker and Flutter releases. Older native hosts must retain their current in-app behaviour safely until updated.

Provide safe enable/disable controls for new outbound alerts. Disabling the enhancement must leave the payment queue, inbox and manual approval operational. Rollback must not delete receipts, ledger history or access grants. Do not deploy, publish installers or enable live external messaging without the applicable release approval.

Finish with a concise handover containing:

1. What already worked, what was changed and why, with relevant files and migrations.
2. Test commands/results and the platform capability matrix, including blocked or untested states.
3. Required owner setup: actual community URLs, credentials, packaging/signing, hosting/workers and rebuilds.
4. Outstanding approval requests, limitations, measured alert timings and rollback instructions.

Keep **implemented**, **configured**, **device-tested**, **deployed** and **approved for release** separate. Do not report a feature complete merely because its UI exists.

## 10. Sources and technical references

### Source basis

**[S1]** `APP_OVERVIEW(2).md` — *Goal Hint — App Overview*, reviewed 3 November 2026. Relevant sections: **What has been implemented**, **Payment integration and approvals**, **Access and everyday use**, **How the app works**, and **Current boundaries and unfinished work**.

**[S2]** Owner's discussion accompanying this prompt — approved Community placement in the existing More menus; public channel access; concise, nonduplicated UI; prior approval for major changes; validation rather than rebuilding of payments; prompt reviewer alerts with a lightweight local tone; one-tap navigation to the specific review; shared Next.js/Flutter architecture; coordinated supported-platform work; manual approval until payment APIs are introduced.

Section 6 adds externally checked technical constraints and chosen implementation defaults. It does not reinterpret the source overview as evidence that these integrations already exist. Repository-specific details remain subject to inspection.

### Official platform references checked for this brief

**[T1] MDN — Autoplay guide for media and Web Audio APIs.** User-gesture and playback restrictions.  
`https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay`

**[T2] MDN — Push API.** Service-worker-based push and subscription handling.  
`https://developer.mozilla.org/en-US/docs/Web/API/Push_API`

**[T3] MDN — ServiceWorkerRegistration.showNotification().** Persistent notification options, device-default sound behaviour and click handling.  
`https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerRegistration/showNotification`

**[T4] Firebase — Receive messages in Flutter apps.** Foreground/background handling, initial notification interactions and force-stop restrictions.  
`https://firebase.google.com/docs/cloud-messaging/flutter/receive-messages`

**[T5] Android Developers — Create and manage notification channels.** Channel sound/importance and user-controlled settings.  
`https://developer.android.com/develop/ui/compose/notifications/channels`

**[T6] Android Developers — Notification runtime permission.** Notification permission on Android 13 and later.  
`https://developer.android.com/develop/ui/compose/notifications/notification-permission`

**[T7] Microsoft Learn — Custom audio on app notifications.** Supported formats and packaged resource sources; hosted HTTP/HTTPS sound URLs are not supported by this API.  
`https://learn.microsoft.com/en-us/windows/apps/develop/notifications/app-notifications/app-notifications-custom-audio`

**[T8] Microsoft Learn — Push notifications quickstart and overview.** Windows transport, application identity, registration, activation and deployment restrictions.  
`https://learn.microsoft.com/en-us/windows/apps/develop/notifications/push-notifications/push-quickstart`  
`https://learn.microsoft.com/en-us/windows/apps/develop/notifications/push-notifications/`

**[T9] WebKit — Web Push for Web Apps on iOS and iPadOS.** Home Screen web-app and user-interaction requirements. Check current target-version support during qualification.  
`https://webkit.org/blog/13878/`

---

**Execution instruction:** Start with repository inspection, then implement the agreed changes and evidenced fixes. Preserve the existing interface and payment safeguards. Request approval only where the stated gates apply, and report anything you cannot verify instead of inventing completion.
