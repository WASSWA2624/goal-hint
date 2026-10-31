# Account layout studies

Selected: **Admin classic**. See [plan 197](../../dev-plan/197-admin-classic-account-workspace.md)
for the implementation and the subsequent shared-app styling refinements.

Ten interactive desktop Account concepts for selection, following the admin
dashboard's left navigation and right detail area. Every concept includes the
same Account destinations, phone/password forms, and account dropdown. Narrow
screens switch to a section menu. Text is limited to labels, values and actions.

| Concept | Layout direction |
| --- | --- |
| Admin classic | Existing admin-style sidebar, flat subscription and sign-in sections |
| Split workspace | Subscription and activity side by side, account details below |
| Compact records | Subscription strip above dense action rows |
| Account passport | Phone identity strip with membership and sign-in panels |
| Subscription first | Prominent subscription summary and renewal action |
| Quiet settings | Spacious, single-column settings rows with contextual actions |
| Details and inspector | Primary subscription/activity column with a slim account inspector |
| Grouped settings | Four distinct groups for subscription, sign-in, payments and preferences |
| Action footer | One detail sheet with actions anchored at its bottom |
| Account ledger | Edge-aligned detail rows with actions at the end of each row |

`account-layout-studies.html` is the editable inline fragment. Use the visualization
host or its bundled `scripts/render.py <absolute-fragment-path> --serve --port 0`
for preview; the host supplies the carousel, icons and optional design controls.
It is intentionally separate from production routing and authentication.

Records are fictional. Forms provide local preview feedback only, never call
account APIs, and never store passwords. Custom Filters remains in Slip Builder.
No referral balance or reward statistics are invented. Once a concept is chosen,
its layout can be implemented using the app's shared workspace and form components.
