# Desktop slip sharing

The selected **03, Slim drawer** design adds a shared Share action to full desktop
slips on Best Slips and Slip Builder. A narrow right-side dialog shows the slip
image, caption links, Save image, Copy caption, and WhatsApp. Aggregate-only
previews do not expose a share action for hidden selections. Mobile sharing UI
remains a separate future design step.

The action is a sibling of the native slip disclosure, outside its summary.
Opening sharing therefore leaves the selections' expanded/collapsed state
unchanged. Native dialog behavior provides modality and Escape dismissal; close
returns focus to the Share action. The drawer loads only when needed and reuses
an already-created shared record when reopened.

## Preparing a shared slip

Opening the drawer creates an explicit public snapshot. The interface states
that anyone with its link can view the selections. `POST /api/slips/share`
requires a same-origin request and an authenticated, entitled member. The browser
submits a source and server-generated slip identity, rather than an authoritative
snapshot:

- Slip Builder sends bounded criteria; the server rebuilds and rebinds the
  selected forecasts before publication.
- Best Slips resolves the selected slip from the sealed publication for its day.

The resulting immutable record has a random permanent `/s/<token>` URL. Its
public response contains the shared slip, token, canonical URL, and creation
time, without account, phone, session, owner-digest, or rate-limit information.
The public page can be read and shared again without signing in. Full storage,
authorization, deduplication, throttling, and integrity details are in
[Shared slip links](shared-slips.md).

## PNG images and downloads

The browser renders actual PNG files from that snapshot, using the established
Goal Hint identity on a light image background. Each export includes the teams,
market and selection, original odds, kickoff date/time in EAT, total odds,
shared slip ID, website URL, permanent slip URL, and **Created with Goal Hint**.
Provider images and remote logos are not fetched for the export.

Text is measured and wrapped without silently shortening a team name or omitting
a selection. One canvas is reused sequentially at **1080px wide**, no more than
**8192px high**, and at most **32 selections per image**. Tall measured rows can
produce an earlier page break. The existing maximum of 800 selections remains
supported, with every selection appearing exactly once across the images.
Additional images have a page indicator and preview paging controls.

Save image downloads one PNG for an ordinary slip. Save all images downloads
one ZIP containing every numbered PNG and `caption.txt` for a larger slip. The
caption includes the slip summary, app URL, permanent slip URL, and branding.
Copy caption writes the same text; when clipboard access is unavailable, the
drawer presents selectable text for manual copying.

## WhatsApp handoff

The WhatsApp action checks browser support for the prepared file-sharing data
at the user gesture. Supported browsers open their native sharing UI with all
PNG files and the caption. The operating system controls its available targets;
the website cannot guarantee that WhatsApp is installed or select it silently.
Cancellation does not claim that a message was sent.

The desktop fallback opens a `wa.me` URL with the caption and downloads the
image, or the image ZIP. In WhatsApp, the user chooses a chat, attaches the saved
image(s), and sends the caption. A ZIP must first be extracted. A text-sharing
URL alone cannot attach a generated photo. The drawer keeps Save image and Copy
caption available for this manual path.

## Deployment and installed-app opening

Apply the SharedSlip database migration and its `SELECT, INSERT` application-role
grants before deploying the sharing API; see [storage deployment](shared-slips.md#storage-and-deployment).
The API fails closed when the required storage is unavailable. Source changes
do not migrate a deployed database or grant privileges automatically.

HTTPS links continue to work on the website. Installed-app opening additionally
requires the actual release signing fingerprints or Apple team identifier,
deployed association documents, and a rebuilt, signed, installed native host.
Follow [Shared-slip app links](slip-app-links.md) for configuration and physical
device verification. Current source and browser checks do not establish that
a deployed domain or an existing signed app is verified.

## Verification status

All **60 focused web tests** and **51 Flutter tests** passed, together with lint,
TypeScript checking, Prisma generation, and schema validation. Browser checks
created a real **1080×1104** PNG and an **800-selection ZIP with all 25 PNGs**,
verified native sharing/cancellation, manual clipboard recovery, caption links,
desktop containment, error recovery, and Escape focus restoration. Reopening a
cached share does not publish it again.

The broader web suite has four unrelated existing failures after the new
environment-example assertion was updated. The real MySQL integration test
skipped because a test-server binary is unavailable. Exact checks and the final
optimized build result are recorded in
[plan 153](../dev-plan/153-slim-drawer-slip-sharing.md). Deployed migration/grants
and signed-device app-link checks remain separate operational qualification.
