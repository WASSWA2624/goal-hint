# Admin Codes interface samples

Open `/admin-code-designs` on the running application, normally
<http://localhost:3000/admin-code-designs>. Select samples **01–10** using the
number strip, sample selector, previous/next buttons, or overview cards.
Fragments such as `#05` open a specific sample directly.

| Sample | Name | Arrangement |
| --- | --- | --- |
| 01 | Balanced | Account and plan side by side, followed by access terms |
| 02 | Form ledger | Stacked account fields and ruled form sections |
| 03 | Framed sections | Separate account, terms, and reason panels |
| 04 | Guided grant | Numbered sections in the order of granting access |
| 05 | Side notes | Account and terms beside the required reason |
| 06 | Compact desk | Smaller list rows and reduced form spacing |
| 07 | Open canvas | Wider spacing around each group of fields |
| 08 | Accent rail | A shared brand accent along the form and details |
| 09 | Horizontal rhythm | Full-width account fields with a distinct terms row |
| 10 | Quiet sheet | A centered form with restrained borders |

Use **Grant access** and **Record details** to compare the two views, and
**Dark**/**Light** to switch theme. **Reset sample** restores the fictional
records and form state. The form and list adapt to the current browser width;
mobile records put their additional information and actions inside a details
disclosure.

## Shared components and behavior

All ten samples render the real `CodesEditor`, `ManualCodeForm`, validated
`PhoneInput`, plan field, record workspace, action buttons, status badges, and
provider artwork. Variants change section arrangement and visual hierarchy
through scoped styles rather than duplicating forms or business components.

The common Codes refinements also apply to the production components: a visible
Codes header, floating search/status fields, capitalized status labels, compact
code/phone/status list rows, and full record information in the details view.
The manual form keeps required reason validation and custom-day rules, explains
the reason field, and uses shared logo radio choices for optional payment
details. The ten sample compositions are available for selection before a
specific composition is applied to the production workspace.

The gallery contains synthetic records only. Its request adapter operates in
memory; it never loads private records, posts to admin APIs, refreshes server
data, or contacts messaging services. Preview forms also use a harmless GET
fallback, including before hydration. Reloading clears preview changes. The
page has `noindex, nofollow` metadata.

## Verification

Run `python scripts/verify-code-designs-rendering.py` from `next-js/` to build
the real components in an isolated production fixture and verify the rendered
gallery, shared controls, safe form actions, unique identifiers, and local
artwork. Add `--serve` to keep the verified preview available in a browser.
Use `--fixture .tmp/code-designs-… --serve` to reopen an existing fixture.

Generated fixtures and browser screenshots belong in ignored `.tmp/` and
`output/playwright/` directories.
