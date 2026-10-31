# 013 — Native shared-slip handoff

Extend the existing document-bound referral-sharing bridge to canonical shared
slip links and generated PNGs using the installed share_plus dependency. Keep
business/access logic in Next.js and preserve existing host origin, nonce,
visibility, navigation and concurrency checks. Accept bounded PNG bytes only;
never accept filesystem paths, remote images or arbitrary URLs. Return quiet
cancellation or handoff/failure without claiming delivery. Existing referral
requests remain compatible.

The web drawer prepares PNGs/base64 before user activation. Native limits are
32 files, 4 MiB each, 12 MiB total, with canonical token filenames and expected
PNG dimensions. Oversized exports retain link sharing/download alternatives.
The plugin manages temporary file copies in its app cache; installed target apps,
large-file handling and actual WebView downloads require device qualification.

## Verification

- All 13 focused native bridge, shared-link and platform tests passed. Coverage
  includes canonical/foreign/malformed requests, bounded PNG payloads and file
  names, nonce ownership, popover anchor, cancellation, concurrency and navigation.
- Flutter analysis passed without issues after formatting guard blocks.
- The actual injected JavaScript template completed a browser channel handshake
  with a prepared PNG and quiet cancellation. Web Share, external apps and native
  channel outcomes were simulated; no messages were sent.
- Signed physical-device sharing, cache/download behaviour, app-link association
  and release builds remain Unverified. Existing Android dependency-resolution
  limits remain in the release-verification group, not a feature completion claim.
- See [web batch verification](../../next-js/dev-plan/203-phone-slip-sharing.md).
