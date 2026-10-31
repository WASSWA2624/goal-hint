# Invite Friends

Invite friends in the Account overview/subscription summary and the main More
menu opens Account → Referrals. The existing personal link, verified count,
earned/remaining time and recent history stay together in that screen. Signed-out
visitors encounter the normal account sign-in flow; only an eligible verified
member's own link is rendered. Subscription expiry does not remove sharing.

The Invite friends panel comes first, with a concise reward explanation, a
prominent Share invitation action where supported, WhatsApp/Telegram alternatives
and a separate link/Copy link row. Rewards and recent referrals follow in their
own shared Account panels. Phones use full-width native sharing and two balanced
social actions with 44px targets; desktop actions stay together on one row.
There are no automatic prompts or sends.

Each handoff uses the existing canonical `/r/[code]` URL and one short invitation.
WhatsApp receives text plus the link; Telegram receives separately encoded text
and URL. Native Web Share receives title/text/URL. Cancellation is quiet; failures
show a short inline fallback. Successful handoff does not claim message receipt.
Denied clipboard access focuses/selects the existing link for manual copying.
No reward or attribution state changes when sharing or cancelling.

The mobile/macOS Flutter WebView has a thin `share_plus` bridge for native share
sheets. Web UI and referral business logic remain in Next.js. The bridge is
installed only in the configured top-level origin, uses an unguessable
document-scoped nonce and validates bounded public invitation fields and a
canonical Goal Hint referral URL. It rechecks document ownership, serializes
requests, ignores stale navigation/disposal results, and supplies a popover anchor
for iPad. It has no account/session/clipboard/database access. Windows/browser
environments use Web Share where available and retain the explicit alternatives.

No database migration or new service credentials are needed. New registrations
now receive codes immediately; the authorized local backfill supplied the one
missing registered member code and preserved existing links. Preview/apply
commands and the unchanged reward rules are in [referral-rewards.md](referral-rewards.md).

Protocol references: [Telegram sharing](https://core.telegram.org/widgets/share),
[Web Share](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share),
[WhatsApp click to chat](https://faq.whatsapp.com/5913398998672934), and
[share_plus](https://pub.dev/packages/share_plus).
