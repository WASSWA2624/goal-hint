# Terms page and factual review

Prompt 040 implements `/en/terms` in the existing public/information shell.
English strings are externalized, headings and topic anchors are semantic, and
the footer identifies the current page. The shared `InformationNotice` header
keeps the terms/privacy review date and square status surface consistent. The
canonical is `https://goalhint.com/en/terms`; prelaunch `noindex, follow` remains.

## Publication gate and owner decisions

The owner facts confirmed on **12 October 2026** supersede the earlier deferrals:
Wilson Wasswa operates Goal Hint from Uganda for English-speaking football fans
worldwide aged 18+, handles privacy/correction/dispute requests, and approves the
published email `wasswawilon0002@gmail.com`. Shared operator facts come from
`src/domain/public-operator.ts`; contact guidance retains concrete report details,
audited correction behavior and no invented response deadline.

The owner confirmed public API-Football data/logo permission. This is recorded as
owner confirmation, not independent contract verification. The owner also permits
copying, sharing, adapting and reusing **original material Goal Hint owns**, for
any purpose without conditions. The public wording expressly excludes provider
data/forecasts, logos, reporting and other third-party material; no downstream
third-party rights are granted.

Launch and the intended effective date are **1 November 2026**. The plan is stored
as `plannedEffectiveOn`; `effectiveOn` remains null and `releaseReady` remains false
because the privacy notice's actual server country and log/backup retention are
unknown. The public draft no longer lists operator, contact, content reuse or a
planned date as missing. No automatic date-triggered release is introduced.

Final publication depends on completing the factual privacy notice and recording
the applicable release decision. No acceptance/clickwrap, account, payment,
betting, tracking or deployment system is introduced by these edits.

## Evidence checked against the implemented service

Paths below are relative to `src/` unless otherwise stated.

| Public statement | Actual evidence and limit |
| --- | --- |
| Free, account-free information; no betting, payments or visitor subscriptions | `domain/public-policy.ts`, public page/HTTP handlers and Prisma schema. No visitor account, stakes, payment or subscription flow exists. |
| Four forecast families, regulation including stoppage time; no extra time or shoot-outs | `domain/markets.ts`, `domain/market-settlement.ts`, `server/settlement/settlement-service.ts`. Over/under uses 2.5. |
| Estimated probabilities; no guaranteed wins/accuracy; qualification remains provisional | `domain/markets.ts`, `server/performance/public-performance.ts`, `i18n/messages/help.ts`; OP-16/17 are still unapproved. Counts/withheld metrics are not a quality claim. |
| AI first, validated API-Football fallback for missing groups; selection independent of the larger percentage | `server/refresh/refresh-service.ts`, `server/fallback/`, `server/predictor/` and Help forecast guidance. This describes the implemented process, not an assertion of active paid accounts, approved live model or source licensing. |
| One daily midnight EAT run, today plus six days; partial/delayed/missing information | `domain/calendar.ts`, `server/selection/selection-trigger.ts`, `selection-service.ts`, `server/refresh/refresh-service.ts`. Public reads do not dispatch jobs. No new cadence or availability SLA is promised. |
| Publication strictly before five-minute cutoff; earlier play closes publication; original clocks retained | `server/predictions/publication-eligibility.ts`, `cutoff-service.ts`, `server/refresh/refresh-service.ts`. Eligible old forecasts may remain when no source supplies a valid update; no new timestamp is invented. |
| Locked picks and verified regulation results; pending/void and audited corrections | `domain/market-settlement.ts`, `server/results/result-sync-service.ts`, `server/settlement/settlement-service.ts` and `server/predictions/lifecycle-service.ts`. A result correction can resettle the same immutable pick; it does not select a better historical forecast. Public dispute handling remains unavailable. |
| Browsing/searching/filtering supported; no new reuse licence | Existing public pages/read endpoints; no approved operator IP assignment or site-content licence is recorded. The draft neither invents a commercial/noncommercial licence nor asserts ownership of provider/team/reporting assets. |
| API-Football by API-Sports credit and original source attribution | Help forecast guidance, match detail provenance and permission-controlled source display; `assets/brand/README.md` governs local branding only. Source credit is not permission, endorsement or affiliation. OP-06/13 remain gates. |
| Privacy facts are a prelaunch summary | `domain/privacy-notice.ts`, `/en/privacy`, `docs/privacy-page.md`. The terms link the actual summary without claiming that a final privacy notice is effective. |

The terms link the forecast, update and result sections of `/en/help`, plus
`/en/privacy` and the existing contact guidance.
Detailed operational rules stay in those documents instead of being duplicated.

## Current authoritative references and applicability limits

Reviewed on 10 October 2026:

- [WIPO copyright FAQ](https://www.wipo.int/en/web/copyright/faq-copyright),
  particularly ownership, authorization, national exceptions and Internet works.
  Public availability and attribution alone do not establish a downstream reuse
  licence. Actual ownership, permission terms and the relevant jurisdiction
  still require evidence; the page does not give Goal Hint third-party rights.
- [CMA: Writing a fair contract for customers](https://www.gov.uk/guidance/writing-a-fair-contract-for-customers),
  updated 22 July 2026, is a **conditional UK review reference** about clear, fair
  terms/notices and the risks of broad exclusions. UK law's applicability is not
  established. No UK governing-law clause, liability exclusion, age restriction,
  mandatory arbitration or enforceability claim is copied into this draft.

These sources inform the review checklist. They do not identify the operator,
decide governing law, approve the wording or substitute for the owner decisions
and jurisdiction-specific review required before final publication.

## Acceptance

After `npm run build`, start a local production server and run:

```text
npm run test:terms:html -- http://127.0.0.1:<port>
npm run test:privacy:html -- http://127.0.0.1:<port>
npm run test:navigation:html -- http://127.0.0.1:<port>
```

The production terms verifier inspects initial HTML, canonical/noindex, anonymous
access, semantic anchors, visible draft/release status, factual limits, review
date, footer/current link and query isolation. It fetches the real linked
documents and checks every target anchor. Browser acceptance covers keyboard
navigation, responsive/200% text layouts, no-JavaScript/blocked-storage access
and lack of page errors, client polling, third-party requests or tracking writes.
Shared privacy rendering is rechecked after extracting its notice header.
Actual commands/results and remaining release blockers are recorded in
`docs/development-progress.md`.
