# Android and Windows app downloads

- [x] Add a shared themed download page, desktop header action, mobile icon and menu destination.
- [x] Detect supported operating systems, permit manual platform choice and keep Apple platforms out of this release.
- [x] Serve verified development APK/EXE files locally; use a configured Google Play listing for production Android.
- [x] Remember invitations, dismissals and download requests per native release, with installed-version comparisons inside the native host.
- [x] Stream installers with download headers/range support and publish a verified, persistent production Windows catalog during cPanel deployment.
- [x] Verify layouts in both themes and mobile/desktop, runtime contracts and packaging checks.

Production Google Play URL remains intentionally blank until the owner publishes the listing. Actual Play version/build settings enable native update comparisons. No production deployment or store publication is part of this change.

Visual refinements use platform silhouettes, a single left-aligned logo/heading
row, an inline recommended label, compact release details and a link back to the
web app. Installation instructions beneath the primary action were removed.

The existing Android development download is a universal Flutter debug APK.
Its size was audited: about 103 MB of engine libraries for three architectures,
18 MB of debug kernel and 14.5 MB of graphics validation code. A native Android
WebView host is recommended as a separate packaging change for small downloads.
