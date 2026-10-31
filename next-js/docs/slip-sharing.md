# Slip sharing

Full Best Slips and Slip Builder cards share one lazy-loaded drawer on desktop
and phones. Ordinary slips remain collapsed. The Share action is a sibling of
the native disclosure; header taps toggle selections and Share does not. Closing
restores trigger focus. Shared-slip pages retain their current expanded default.
Aggregate-only previews expose no sharing action.

The drawer prepares the existing immutable snapshot and branded PNGs. It clearly
separates **Share link**, **Share image(s)** and **WhatsApp link**. The WhatsApp URL
carries text and links only; images are never silently attached. Opening a target
never claims delivery. Cancellation is quiet; unavailable/failed native sharing
retains explicit copy, manual selection and download controls.

Copy link copies the canonical token URL. Copy caption includes the summary,
URLs, branding and access requirement. Clipboard denial exposes focused,
selected text. One image downloads as PNG; long slips download one ZIP with all
PNGs and caption.txt. Existing measured 1080px exports support up to 800
selections, 32 per image and at most 8192px image height without truncation.
Images contain selections and can be forwarded independently of link permissions.

Browser file sharing is used when supported. The existing Flutter bridge handles
canonical referral/shared links and bounded generated PNGs with share_plus.
Only the owned top document can invoke it; origin, per-document nonce,
visibility/lifecycle and concurrent-sheet checks remain intact. It accepts no
filesystem paths or remote images. PNGs must match the shared token filename,
1080px width and the export height limit. Limits are 32 files, 4 MiB each and
12 MiB total, checked before posting and after native parsing. Larger exports
retain link sharing and the browser download/manual path; actual download support
inside an installed WebView still needs physical-device qualification. PNG
encoding happens before the Share click to preserve user activation. Existing
referral payloads remain compatible.

See [recipient access and storage](shared-slips.md) and [batch verification](../dev-plan/203-phone-slip-sharing.md).
Earlier desktop evidence remains in [plan 153](../dev-plan/153-slim-drawer-slip-sharing.md).
No schema or permission migration is added by this batch. Production deployment,
signed app links and installed-app/device handoffs remain separate release checks.
