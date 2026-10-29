# 009 — Shared-slip app links

Keep the Flutter application a thin host for the web-owned shared slip page.
Accept only `/s/<32 lowercase hexadecimal characters>` on the configured origin.
Handle a native initial route and later route notifications without creating a
second native page, browser, or session; repeated link events reload that slip.
Ignore malformed and off-origin native links.

Android declares a verified HTTPS link filter for `goalhint.com/s/`. iOS declares
the associated-domain entitlement for the same host and keeps built-in Flutter
deep linking enabled. The web owns the two `.well-known` association documents;
their public signing/team settings are documented in
[`next-js/docs/slip-app-links.md`](../../next-js/docs/slip-app-links.md).

No signing fingerprint, Apple team ID, or signing secret is invented or committed.
Automated tests validate the code paths. Device verification, signed rebuilt
apps, and public deployment remain required before installed-app opening can be
claimed. Record actual verification in the Flutter tracker.

Final checks: all 51 Flutter tests passed; targeted analysis of the five changed
Dart files passed with no issues. Five web association/config tests, targeted
ESLint, plist parsing, and whitespace checks passed. Signed app and device/domain
verification remain unperformed. The tracker records scope and limitations.
