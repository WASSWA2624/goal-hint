# Automatic desktop slip match updates

## Scope

- Automatically refresh scores, provider elapsed time/HT/FT and selection
  outcomes in desktop Best slips and the slip builder.
- Preserve original slips, picks, odds, probabilities, form drafts and native
  disclosure state. Keep mobile presentation and refresh behavior unchanged.

## Design

- Use one shared, deduplicated observation batch per desktop slip list every
  20 seconds. Never rebuild a generated slip to update its matches.
- Send compact original-selection identities to a bounded same-origin endpoint;
  read existing sealed stored evidence without contacting football providers.
- Validate original cycle/revision/pick identity and recheck entitlement before
  storage access and before releasing a private, non-cacheable response.
- Pause hidden/offline/navigation-pending work, abort stale requests, and refresh
  immediately when the visible online page resumes. Retry transient failures
  without inventing match time or replacing coherent observations.
- Fail closed on known access expiry/revocation and refresh the gated screen.
- Keep Best slips' cohort/summary refresh at 60 seconds on watched desktop
  lists; preserve the existing 20-second mobile/aggregate-only page refresh.

## Verification

- Full optimized application build, TypeScript/offline manifest and ESLint pass.
- 96 focused contract, handler, controller/transport, original-state, forecast,
  builder, Best slips, paywall and demo-runtime regressions pass.
- All 12 isolated SSR scenarios pass, including gated HTML/Flight responses and
  dynamically rechecked access on the actual automatic-update fixture pages.
- Browser clock tests prove both actual screens update scheduled -> live 1-0/30′
  -> HT 1-1 -> final 2-1/Won. Two slips share one batch of three unique watches;
  four total requests cover the initial read and three updates with no overlap.
- Original snapshot/header facts, the same open disclosure DOM node, and an
  edited builder count remain intact through those updates in light/dark themes.
- Additional browser checks pass for hidden/offline/navigation pauses, immediate
  resume, retained data on 503, retry recovery, and 403 withdrawal on both screens.
- Real-time phone checks on both screens make zero observation requests for a
  full polling interval; resizing to desktop starts polling and resizing back
  stops it. Phone cards and spacing retain their existing implementation.
- Local unauthenticated API probing returns 403; guarded implicit demo credentials
  and explicit sign-out/production behavior have dedicated passing regressions.
- Preserve other mobile preview work, stashes and detached worktrees; commit
  only this change and push the verified main branch.
