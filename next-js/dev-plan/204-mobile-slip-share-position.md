# 204 — Mobile slip header sharing icon

Move the existing mobile slip Share action immediately after the slip status
badge. Render only its icon with an accessible Share name and 44px touch target.
Reserve header space and narrow only the shareable slip badge from 128px to 96px;
keep the action outside the native disclosure so it cannot toggle selections.
Remove the former action row. The follow-up also removes the mobile arrow and
its reserved grid column while retaining header-tap disclosure and the extreme
left blue strip. Desktop cards, match badges, sharing behaviour and
the drawer remain unchanged.

Verify phone/tablet widths, status labels, publication dates, both disclosure
states and keyboard/focus behaviour using the existing production sharing fixture.
Record actual checks, commit/push main and preserve existing worktrees/stashes.

## Verification

- Strict TypeScript and changed-file ESLint passed. The production sharing fixture rebuilt and its HTML/API checks passed.
- Playwright passed **24 source/width/theme combinations**: Best Slips and Slip Builder at 1440/1024/768/390/360/320px in light/dark themes. Publication-day and publication-time headers were included.
- Mobile checks confirmed an icon-only accessible Share button, 44×44px target, 96px slip badge, 6px separation, aligned centres, no arrow/arrow column and the retained 4px blue strip. There was no horizontal overflow. Desktop retained its labelled Share button and disclosure arrow.
- Both collapsed and expanded cards opened the unchanged sharing drawer without toggling. Header taps still expanded/collapsed, Escape/Close restored trigger focus, and keyboard Enter/Space behaviour passed. Shared-page initial expansion remained unchanged.
- At 320px, all seven status labels fit in a DOM text stress check, including reserved progress-dot space for In progress. Captures at 390px light and 320px dark were visually inspected. The only console error was the expected fixture-only missing service-worker script; there were no hydration warnings.
- This was a web presentation change. Existing release/device qualification remains recorded in plan 203; no new device or deployment result is claimed.
