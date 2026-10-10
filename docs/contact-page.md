# Contact page and correction-reporting availability

Prompt 041 implements `/en/contact` in the reusable information/public shell.
The short English page has semantic headings, shared square components, readable
typography and a canonical URL of `https://goalhint.com/en/contact`. Prelaunch
`noindex, follow` remains. The existing footer marks Contact as the current page.

## Owner decisions and release blocker

**No verified public contact route, publication-approved operator details or
responsible correction/dispute owner has been supplied.** OP-25/27/28 remain
explicit launch blockers. The owner chose to keep correction/dispute ownership,
intake, evidence/review rules and response commitments unresolved during 038,
then deferred operator/jurisdiction/public contact facts during 039. Those
instructions carry forward; implementing 041 does not approve or reopen them.
Incident ownership and private alert destinations also remain unresolved under
OP-29/30; this page does not establish an incident-support service.

`src/domain/contact-notice.ts` records `publication: prelaunch-unavailable`,
`releaseReady: false`, `destination: null` and the actual repository review date,
10 October 2026. The shared `InformationNotice` displays the absence of a public
route and the release block. No email, address, phone, operator name or response
deadline is substituted. The page has no form, disabled submit control, upload,
account, public comments system or messaging backend. Its factual unavailable
state can be reviewed locally; it is not an operational intake route.

Before launch, the owner must supply and record:

1. A verified public email or already established contact destination, evidence
   of ownership/control and explicit publication approval (OP-28).
2. The actual operator details approved for publication and applicable legal
   review (OP-27). GitHub authorship, branding and timezone are not this evidence.
3. The responsible correction/dispute owner, intake/review and supporting-evidence
   rules, and any response commitment grounded in real capacity (OP-25). No
   response time or automatic correction promise is approved.

Destination-evidence matching and verification of a real external contact link
remain **blocked**, rather than passed using a fake or test address. There is no
active-contact branch or environment switch. Final release review must enforce
this gate; visible copy and noindex are not an automated deployment lock.

## Guidance and policy integration

- Report guidance covers fixture/team identity, source mistakes and result/
  forecast-outcome concerns. Once a verified route exists, the useful public
  details are the match/revision URL, observed issue/proposed correction and a
  supporting public source link if available. Personal/sensitive information is
  unnecessary. The page currently collects nothing.
- Verified result corrections preserve the immutable locked forecast, produce
  audited outcomes and can leave an outcome pending before verified settlement.
  They never select a more favorable revision. Visitor reports do not themselves
  mutate stored records. Evidence: `src/server/results/`,
  `src/server/settlement/settlement-service.ts`, `src/server/settlement/settlement-read.ts`,
  prediction-history/locking contracts and the published methodology.
- Ordinary links lead to the current privacy, terms and methodology documents,
  including the actual settlement section. The privacy choices, terms results/
  corrections and methodology correction sections link back with the shared
  label "Contact availability and correction guidance". These labels do not
  imply that an inbox or submissions process is available.

## Link and input boundary

The page accepts only the route locale and normalizes internal links through
`informationHref`; there are no user-provided contact destinations or mail
headers. Request query fields such as email, operator, destination, subject,
body or returnTo are ignored. All rendered navigation links are fixed local
paths/fragments. This avoids introducing an unused arbitrary-mailto builder or
trusting unapproved settings while the destination is absent.

When real owner evidence is supplied, the active route must be reviewed and
validated as the exact approved bare `mailto:` address or established HTTPS
destination before publication. Reject executable/other schemes, credentials,
control characters and header injection; keep visitor query data out of both
destination and mail headers. Structural checks must not send messages or
create/subscribe an inbox. No test email or third-party contact is authorized.

## Local acceptance

Build and start a local production server, then run
`npm run test:contact:html -- http://127.0.0.1:<port>` alongside the existing
privacy, terms and navigation HTML verifiers. The contact verifier checks initial
server content/CSS, canonical/noindex, unavailable/release status, correction
guidance, safe same-origin schemes and ignored CRLF/script/destination query
payloads. It checks contextual contact links in all three actual policy pages.

Browser acceptance covers footer/contextual links, logical keyboard navigation,
visible focus, 320–desktop widths, 200% text, no-JavaScript and blocked-storage
access. It also checks that the flow adds no cookies, storage writes, browser
API polling, external requests or page errors. Build/type/lint and relevant
navigation/settlement contracts verify integration. Actual results and remaining
external checks are recorded in `docs/development-progress.md`.
