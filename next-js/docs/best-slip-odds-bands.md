# Best Slips and personal builds

Personal slip builds are transient. Users can generate, view and export images in the browser. They can save up to ten named filter presets; generated selections are never saved to their account or published by sharing.

The private daily publication worker publishes up to twenty qualifying, disjoint slips per odds band per East Africa date (up to one hundred total): 1.5–5, 5–10, 10–20, 20–50 and 50–100. Exact boundary quotes belong to the next band (5.00 belongs to 5–10); 100.00 is included. Publication uses the existing model, forecast, quote and cutoff checks. Sparse bands contain fewer slips, without invented selections or adjusted prices. Completed bands are immutable; retries attempt only missing bands.

Best Slips defaults to 1.5–5. Yesterday’s summary uses the selected band; selecting a result drills down to yesterday with that band retained. Browsing starts today and covers thirty days by default, twenty slips per numbered page. Date filters, page navigation and cached responses retain the band. Custom date is the first date option and opens the existing draft/Apply dialog.

Sealed legacy publications remain unchanged and are classified by their stored total odds for browsing. New bands are not appended to an already sealed legacy day. Stable public ranks reserve twenty positions per band (1–20, 21–40, 41–60, 61–80, 81–100); existing public ranks retain their original identities.

## Deployment

Deploy migration `20261103120000_transient_slips_and_odds_bands` with the migration account while application and worker writes are stopped, after a verified private backup. Use the corresponding `prisma/mariadb` overlay on MariaDB. The migration permanently deletes personal saved-slip records. It preserves filter presets, editorial publications and previously shared public links. New public sharing returns the canonical Best Slip URL without storing another snapshot.

Start the updated application and daily publication worker after migration. Production data is changed only when that deployment migration runs.
