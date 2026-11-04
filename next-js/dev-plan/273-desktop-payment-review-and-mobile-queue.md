# 273 — Desktop payment review and mobile queue

- Lead desktop review with a plain, read-only summary of the copyable reference,
  subscriber phone, package, submitted time, access period, and status.
  Put the copyable transaction ID, receipt, deposit, funding and days below it.
- Keep the desktop review mounted during selection changes. Reset receipt
  drafts per payment and disable checkout actions while the next record loads.
- Submit receipt checks and checkout approval together. Retain verified funds
  for shortfalls and expose ownership controls on disputed receipts.
- Advance to the next matching pending payment, including another page.
- Put the rejection opener and Cancel on the left. Put Approve and the final
  Reject on the right. Keep rejection in a dialog centered over the review
  pane. Require one or more presets or a written explanation and require
  an explanation when Other is checked. Dismiss with Cancel, Close, or
  successful submission.
- On mobile, scroll only the payment list. Pin the search and sort toolbar and
  keep multi-page pagination just above the bottom navigation.
