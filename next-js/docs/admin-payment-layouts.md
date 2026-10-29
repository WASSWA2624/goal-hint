# Desktop payment layout review

Open `/admin-payment-layouts/index.html` on the running application to compare
ten revised Payments designs. The local review is at
<http://localhost:3000/admin-payment-layouts/index.html>. Links ending in `#01`
through `#10` open a specific design. This gallery replaces the earlier studies;
**01 / Balanced review** is now applied to the live admin Payments screen.

Use the numbered strip, previous/next layout buttons, or **All 10 layouts** to
compare the options. **Shortlist** saves favorite numbers in this browser.
The other concepts remain available for future comparison.

| Number | Concept | Arrangement |
| --- | --- | --- |
| 01 | Balanced review | Transfer and account beside the evidence |
| 02 | Verification sheet | Broad confirmation fields above supporting sections |
| 03 | Transaction ledger | Aligned form rows beside account, checks, and evidence |
| 04 | Evidence desk | Large evidence panel beside transfer and account |
| 05 | Decision rail | Editable confirmation in a dedicated side column |
| 06 | Guided review | Numbered, visible sections in review order |
| 07 | Review workbench | Account, confirmation, and evidence in distinct columns |
| 08 | Document review | Restrained document composition with an evidence margin |
| 09 | Attention first | Verification concerns before the payment fields |
| 10 | Compact essentials | Shallow confirmation area with supporting evidence below |

## Shared review principles

- One editable amount and transaction ID per selected payment, with visible
  provider and package controls. Avoid repeated amount banners and footer totals.
- Distinct payment/account information in one place. Show a package price only
  when it helps explain a difference; describe automatic checks without copying
  the same figures into each check.
- Illustrative evidence is marked as fictional. It does not create another
  transcript of the same payment values. Production continues to use real
  uploaded evidence and existing verification services.
- Previous/count/next payment navigation sits immediately before Refresh queue.
  Provider artwork aligns with the top of the payment reference.
- Persistent approval/rejection actions, independent queue/detail scrolling,
  square edges, keyboard focus indicators, and light/dark appearances.

## Sample interactions

The gallery includes fictional status queues, normalized search, provider
filtering, sorting, editable confirmation fields, wallet SMS entry, an evidence
preview, and illustrative subscriber details. Approving or rejecting operates
on the in-memory sample queue and advances to another report. Reloading resets
sample records and drafts. Only shortlist and theme preferences persist.

No private records are loaded and no payment APIs are called. The page is marked
`noindex, nofollow` and supports desktop windows at least 1024px wide. Mobile
visitors see a desktop preview notice.

The live Payments screen uses Balanced review: canonical editable payment fields,
subscriber context, and open checks on the left; the actual uploaded evidence
on the right. Provider and package controls remain visible. The transaction ID
has a one-click copy button that copies the current edited or historical
value and confirms success. There is no repeated desktop amount banner or footer
total. The desktop navigator remains beside Refresh queue and provider artwork
aligns with references. Mobile queue/review navigation and payment services
retain their existing behavior.

## Source and local serving

`public/admin-payment-layouts/catalog.js` defines the ten arrangements;
`app.js` renders reusable review sections and sample interactions; `styles.css`
defines shared geometry and the desktop variants; `index.html` provides the
shell. All artwork is local. No package installation or database is required
for the buildless gallery. To serve it independently, run from `next-js/`:

```powershell
python -m http.server 3122 --bind 127.0.0.1 --directory public
```

Local QA logs and screenshots belong in ignored `.tmp/` and `output/` folders.
