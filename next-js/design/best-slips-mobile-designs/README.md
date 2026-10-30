# Best slips — mobile page concepts

Ten review-only page concepts for the Best slips mobile screen. The authored
fragment is displayed in the chat's named variant carousel; its previous/next
controls and picker come from the visualization host. The host also provides
light/dark/device appearance and Subscriber / Free member / Guest preview modes.

| Concept | Layout decision |
| --- | --- |
| Blue Signal | Familiar desktop identity rail, clearly labelled mobile card metrics. |
| Open Ledger | Borderless rows, compact inline facts and restrained result tabs. |
| Status First | Large, tappable result counts before date controls and slips. |
| Daybook | Date-grouped slips with a timeline; starts with the last three days. |
| Easy Reading | Larger figures, more space and a separate match-count line. |
| Thumb Reach | Date and result controls follow the slip list, near bottom navigation. |
| Slip Index | A dedicated number column makes slips easy to locate and reference. |
| Focus Stack | An expanded leading slip, followed by smaller summaries. |
| Compact Rail | Tight two-line summaries and low-chrome result controls. |
| Browse and Refine | A quiet list with date and result controls in a filter dialog. |

All concepts use the same rendering functions, synthetic data, status meanings,
date rules and local interactions. Filters, counts, empty states, pagination,
slip disclosure, account/More overlays and a sharing-caption preview are operable.
Dialogs trap keyboard focus, close with Escape and return focus to the opener.
Colours follow appearance; corners mirror the shared `theme.radius` scale.

The small review dataset contains 29 illustrative slips across 28–31 October
2026. Dates use EAT. Each preview page has two slips so the whole mobile
composition can be reviewed in the chat; production retains its 50-item page
size. Result counts cover the date cohort before the result filter. Free and
guest previews contain completed slips only and show the subscription invitation.
Account, subscription and other destinations report their intent locally;
they do not authenticate, purchase, navigate externally or publish slips.

Individual match layouts are deliberately deferred. Expanding a slip exposes
its publication metadata and action placement, without introducing new match
rows. Sharing demonstrates its entry point and caption only; the existing
sharing implementation stays in production.

No production components, routes, styles, APIs, desktop layouts or Flutter files
are changed. A chosen concept will be implemented separately after review.
The source is an HTML fragment, not a standalone website. Generated standalone
wrappers and browser captures belong in ignored `output/`, not Git.
