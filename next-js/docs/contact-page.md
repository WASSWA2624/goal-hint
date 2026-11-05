# Contact page

`/en/contact` uses the shared public shell and contains one short introduction plus the email, Call and WhatsApp links published in **Admin → Settings → Support**. It works on phones and desktops in both themes. The canonical URL remains `https://goalhint.com/en/contact`; existing release and indexing gates remain in place.

## Administration and visibility

Open **Admin → Settings → Support**, edit the public email or support numbers, choose their Contact-page visibility, and select **Save changes**. Unsaved edits do not change the public page. Use **Show on Contact page** to hide a number only from this page; use **Visible to customers** to hide it across support screens.

The public email is editable and has its own visibility control. Its initial database default preserves the owner-approved address `wasswawilon0002@gmail.com`. A blank or hidden email is omitted. Only one mailbox is accepted; no subject, body, additional recipients or mail headers can be supplied. The destination opens the visitor's email application.

Support numbers reuse the existing directory, labels, ordering, primary selection and Call/WhatsApp methods. Each number has a separate **Show on Contact page** checkbox. Existing records without this flag remain visible by default. The existing **Visible to customers** checkbox still controls all support surfaces; page-specific hiding leaves checkout and account support available. Both contact editing and page visibility controls work on mobile and desktop. Existing paid-access rules still require a usable support number while subscriptions are open.

## Automatic updates

Initial rendering and `/api/contact` use the same allowlisted public projection and a fresh database settings read. Hidden contacts, a hidden email and private admin fields are omitted server-side, including from serialized page props. The endpoint is uncached.

Visible contact pages quietly refresh every 15 seconds, and immediately when focused or returned to the foreground. Saving support settings triggers a same-page refresh and a browser-storage notification for other open tabs. With a working connection, published changes appear within 30 seconds without a manual reload or rebuild. Passive refresh leaves the page visible and does not trigger navigation progress.

A failed refresh preserves the last confirmed public snapshot until a successful read. With no initial snapshot the page shows a brief unavailable message; an intentionally empty published directory shows an empty state. A database failure never restores the hardcoded/default email or hidden numbers. Requests time out and polling is cleaned up on unmount.

## Deployment and verification

Deploy `20261105120000_contact_page_settings` before running the updated application. It adds the public email and visibility columns; per-number page visibility stays in the existing contacts JSON. Source implementation does not establish production deployment status.

After a schema/client update, start the web process with the matching generated Prisma client. A long-running development server may also need a restart after settings-service changes retained across hot reloads. Verify that `/api/contact` returns HTTP 200 and the intended public settings. The HTML checks also exercise the unavailable fallback, so passing those checks alone does not establish that database-backed contacts are available. Restarting a development web process must preserve its existing database and settings; do not reset or reseed the demo to refresh contacts.

Run the contact settings, support contacts and HTTP tests plus `npm run typecheck` and lint. `python scripts/verify-contact-page-rendering.py --serve` provides an isolated production contact/admin fixture using invented details. Check both themes at phone and desktop widths, saved visibility, open-page polling, cross-tab saves and temporary read failures. `npm run test:contact:html -- http://127.0.0.1:PORT` verifies the actual contact page, safe links, query isolation and contextual policy links without contacting recipients.
