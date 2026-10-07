# 016 Locale navigation

**Feature:** English locale routing and the shared navigation shell.

**Depends on:** [004-eat-calendar.md](004-eat-calendar.md), [015-brand-styling.md](015-brand-styling.md)

**Source:** [app-write-up.md](../app-write-up.md) §§1–3, 9, 12, 13.

## Prompt

Read `dev-plan/000-index.md`, the source sections, repository instructions and existing code. Implement only the locale-aware navigation shell. Reuse the time utilities and shared brand primitives already present.

Make `/` consistently redirect to `/en`. Prepare locale routing with English fallback and language-neutral market/status identifiers. Set the document language correctly. Externalize interface text with stable keys, plural-aware messages and `Intl` formatting; use EAT for reporting dates regardless of browser timezone. Do not expose unimplemented locales or a language selector. Preserve logical spacing and allow translation expansion.

Create a compact shared header/home link, Today and Results navigation, main landmark and footer links for How it works, Privacy, Terms and Contact. The homepage must lead directly into the future match feed without a decorative hero. Both Today and Results use the same dated-feed route contract; define their date/status defaults once and ensure navigation does not create an independent results application. Prepare `/en/predictions/YYYY-MM-DD`, `/en/matches/fixture-id/home-v-away` and `/en/how-it-works` route conventions for later features.

Only add clearly identified interim content where necessary to make the shell runnable. Such placeholders must not claim that no fixtures exist, simulate live predictions, publish legal assertions or become indexable thin pages. Track each temporary surface for replacement by its dedicated prompt. Do not implement feed queries, full match detail, legal documents or the complete SEO feature here.

Keep every public shell route accessible without credentials, visitor tokens or authentication cookies. Use semantic navigation, an accessible skip link, visible current location and keyboard-friendly links. Apply the existing light theme and named brand assets uniformly.

## Acceptance checks

- Check root redirect, English fallback, Today/Results targets and all shell navigation with a fresh browser session.
- Exercise 320 px layout, keyboard navigation, 200% zoom and expanded English test strings.
- Verify shell HTML renders before hydration and contains no unsupported-locale selector, sign-in UI or misleading placeholder state.

## Handoff

Record changed files, checks, temporary surfaces and blockers in `docs/development-progress.md`. Record route and message-organization decisions in `docs/implementation-decisions.md`.
