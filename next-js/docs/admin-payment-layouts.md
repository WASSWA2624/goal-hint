# Desktop payment layout review

The desktop Payments screen now uses **02 · Compact queue**, with the separate
queue heading removed. Search and filters sit directly above the payment list.
The other nine concepts remain available for comparison. The live screen uses
the existing payment services and real evidence; this gallery uses sample data.

The live desktop layout has since been compacted into two-line payment rows,
with expanded sorting and a shared sidebar that collapses or resizes by dragging
its divider. The sidebar also supports arrow keys, Home/End, Enter to reset,
and a reset button beside the Admin caption. Its width/collapse preferences
persist only in the browser. The redundant manual-review summary is removed;
actual warnings and checks remain in the selected payment.

Open `/admin-payment-layouts/index.html` on the running application. The local
review is at <http://localhost:3000/admin-payment-layouts/index.html>.
The HTML carries `noindex, nofollow` metadata.

Use the numbered strip, previous/next controls, or **All 10 layouts** to compare
the concepts. Links ending in `#01` through `#10` open a particular concept.
**Shortlist** records favorite concept numbers in this browser. Tell the
implementer which number to apply; choosing a preview does not apply a design.

| Number | Concept | Review emphasis |
| --- | --- | --- |
| 01 | Classic inbox | Balanced payment information and receipt |
| 02 | Compact queue | Dense list, verification summary, earlier decision form |
| 03 | Transaction ledger | Aligned references and structured reconciliation |
| 04 | Receipt first | Large evidence area beside payment facts |
| 05 | Side by side | Reported amount compared with the package price |
| 06 | Activity trail | Timeline of submission, evidence, and review |
| 07 | Review workspace | Separate fact, evidence, and decision columns |
| 08 | Dark queue | Dark list beside the document review |
| 09 | Grouped by provider | Provider groups and subscriber context |
| 10 | Focused review | Prominent amount and decision form |

All concepts retain the ten admin menu items and four payment-status tabs,
omit the Payments page title, and show the payment list beside a persistent
review. Every list entry includes provider artwork, payment ID, phone, EAT
timestamp, UGX amount, and package. The viewport shell stays fixed; the list
and details scroll separately. Review actions stay available below the details.
All controls and panels have square edges.

The preview is for desktop windows at least 1024px wide. It supports light/dark
appearance, payment selection, status queues, normalized phone/reference/package
search, provider filtering, sorting, empty results, editable sample fields,
and illustrative decision feedback. Only the shortlist and theme persist.

The eighty fictional reports do not load private data or call payment APIs.
The receipt is a clearly marked illustrative document. A production
implementation should retain the existing real evidence and review services.
The gallery never changes a payment. The production desktop implementation
uses the selected layout; mobile keeps its queue-to-review navigation.

This is a buildless preview, following the existing `public/payment-samples/`
pattern. It reuses the local Goal Hint and payment-provider artwork. No package
installation or database is needed. To serve it without the application, run
from `next-js/`:

```powershell
python -m http.server 3122 --bind 127.0.0.1 --directory public
```

The source is in `public/admin-payment-layouts/`: `catalog.js` defines the ten
concepts, `app.js` renders shared sample components and interactions,
`styles.css` controls the layout variants, and `index.html` defines the shell.
Generated screenshots and local QA scripts remain in ignored `output/` and
`.tmp/` directories.
