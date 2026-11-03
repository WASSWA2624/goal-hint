# Slip sharing

Best Slips, the Slip Builder and existing shared-slip pages reuse one lazy-loaded sharing drawer on desktop and phones. Opening Share preserves the slip disclosure; closing restores trigger focus. Unfinished selections require current entitled access. Completed public slips use the same drawer without creating a privileged personal snapshot. Losing required access closes an open drawer.

The drawer has two actions: **Download image** and **Share**. It prepares PNGs before the click so native sharing retains user activation. Download saves one PNG, or a ZIP containing every PNG and caption for a long browser export. Share opens the device sheet with the prepared images and a short branded caption. The receiving device/apps decide which destinations and content are supported. Cancellation is quiet; unsupported sharing explains how to download and attach the image manually.

## Export design

Exports use the shared light palette consistently across both interface themes. The Goal Hint wordmark sits on the branded header. Total odds are left-aligned alongside **Average probability** and match count. Average probability is the mean of the original selection forecasts, never the probability that the entire accumulator wins.

The header status has a semantic coloured background. Confirmed unstarted matches display **Upcoming**; unresolved observations display **Awaiting results**. In-progress, won, lost, void and cancelled states reuse the original-selection progress and adjudicated outcomes. Status is never guessed from date or score alone.

Each selection has a tinted league header with the league badge, match number and kickoff. Both team badges/names share a row. Summary and match-header backgrounds share one rail and inset. The header logo/date and reference/status align with the summary content. Match numbers have their own small highlight; team badges follow the name height. The prediction, odds and selection probability use a plain background and share the next row where they fit; long text wraps without shortening a team or prediction. Settled selections retain result labels within their metadata and semantic result colours. There is no per-selection verification line.

Badges use the existing first-party provider image route, bounded concurrent loading, preserved aspect ratios and initials on failure. A cold provider response has time to finish before the PNG is drawn. The footer is one wrapped paragraph containing branding, website, enabled public support contacts, status-capture time and an existing public slip URL when applicable. Creation time and status-capture time remain separate.

The renderer reuses one measured 1080px canvas, at most 8192px high and 32 selections per page, retaining all selections through the existing 800-selection limit. Large totals remain complete in a wrapped totals section. Images contain selections and can be forwarded independently of link permissions.

## Readable references and compatibility

Slip numbers are eight-digit, zero-padded database sequences. SlipNumber retains only the canonical original-selection fingerprint and assigned number, never personal selections, account IDs or results. Repeated exports of the same original prices/forecasts retain their number. Allocation refuses numbers beyond 99999999. Display numbers are separate from internal identities and existing public URLs.

Existing /s/ tokens continue reading their sealed snapshots, including previously shared custom slips. New custom slips stay in browser memory; their numbering record contains no selections. Published Best Slips use their existing canonical publication URLs. Existing 32-character referral codes and signed 30-day attribution cookies remain valid through legacyReferralCode; current invitations use eight numeric characters, uniqueness constraints and collision retries.

## Native host and deployment

The Flutter bridge supports canonical referral/shared/publication links and image-only custom slips. Root-document ownership, origin, nonce, visibility/lifecycle, activation and concurrency checks remain intact. It accepts bounded PNG bytes only: 32 files, 4 MiB per file, 12 MiB total, 1080px width and at most 8192px height. It never accepts a filesystem path or remote image. Older hosts fail promptly on unsupported readable-reference payloads.

Native downloads use Android's document/folder picker, the iOS Files exporter, or the desktop save picker. Unsupported native downloads direct the user to export in a browser, where PNG/ZIP downloads remain available. An updated host is required for these operations; physical-device target handoffs and iOS compilation remain release checks.

Before deploying, apply **20261103160000_readable_slip_and_referral_codes** with the migration role and the SELECT/INSERT grant documented in [readable-code-grants.sql](deployment/readable-code-grants.sql). MariaDB 11.4 uses the corresponding reviewed overlay. The transient-slip migration preserves existing SharedSlip records. No deployed database was changed by implementation/testing.

See [recipient access](shared-slips.md), [current verification and limitations](../dev-plan/255-branded-slip-sharing-and-readable-codes.md), and [native implementation](../../flutter/dev-plan/014-readable-slip-sharing-and-downloads.md).
