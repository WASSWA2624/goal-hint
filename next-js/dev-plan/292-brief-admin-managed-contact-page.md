# 292 Brief admin-managed contact page

## Approved scope

Reduce `/en/contact` to one short introduction and published email, Call and WhatsApp links. Manage its email and per-number visibility in Admin Settings. Keep Contact-page visibility independent from checkout/account support, support phones and desktops in both themes, and update already-open pages without manual reload.

## Implementation

- Preserve the approved email as the settings default; validate a single editable mailbox and give it its own visibility control.
- Store optional `showOnContactPage` in the existing support directory JSON. Missing flags preserve existing visibility. Global customer visibility still takes precedence.
- Use one public allowlist projection for server rendering and the uncached `/api/contact` endpoint. Read current database settings directly so separate server caches cannot delay propagation.
- Reuse shared contact rows and control heights. Keep the page to one sentence and available contact links, with brief empty/unavailable states.
- Refresh quietly every 15 seconds while visible, on focus/foreground, and after same-browser settings-save notifications. Retain the last confirmed snapshot during transient fetch failures and clean up polling on unmount.
- Keep admin authorization, protected-setting checks, audit history, and existing subscription support requirements.

## Verification and release

Run support/contact domain and HTTP tests, admin settings regression tests, schema generation/validation, lint and typecheck. Build the isolated contact/admin fixture and verify real controls, all four theme/viewport combinations, safe public projection, saved visibility, open-page refresh and outage recovery. Update the app overview and contact documentation. Deploy `20261105120000_contact_page_settings` before the updated application; production deployment is a separate operation.

## Results

- All 43 contact, settings, demo-settings and member regression tests passed; the six email/projection/fresh-read tests also passed after the final mailto formatting adjustment.
- Integrated TypeScript and full-project ESLint passed. Offline Prisma generation and schema validation passed; policy-wrapped database commands returned generic failures, so no database deployment is claimed.
- The isolated production contact/admin fixture built and passed initial HTML/API privacy checks. Eight layout screenshots cover public contacts and admin controls on phone/desktop in both themes, with no horizontal overflow or runtime errors.
- Browser behavior passed: a saved admin change updated the open Contact tab immediately; page-only hiding preserved the separate support directory; an external change appeared after 3.231 seconds through quiet polling without reload; a temporary 503 kept the confirmed snapshot; hiding all contacts showed the empty state.
- Final compact layouts were rebuilt and rechecked in all eight public/admin theme and viewport combinations. After branch integration, TypeScript, full-project lint and 102 combined contact/settings/navigation/checkout/OCR regression tests passed.
- The full production build succeeded with database access disabled. Two existing application-download filesystem tracing warnings remain. Checks against that built server passed all four Contact URL/query variants and the Privacy, Terms and Help backlinks.
- Production deployment and application of the contact-page database migration remain separate release steps.
