# 010 — Android pull-to-refresh

Add native refresh feedback to the existing system-WebView host without adding
a second browser, changing persistent profiles, clearing cookies or duplicating
web screens/business logic.

The pinned `webview_flutter` 4.14.1 controller supplies scroll-position changes.
Only Android advertises this capability. The reusable `WebViewPullToRefresh`
surface observes raw touch events without entering the gesture arena, so native
WebView scrolling and controls continue to receive their events. A deliberate
downward pull that starts at the document top reloads the current document on
release. Short, upward, horizontal, multi-touch, cancelled and mid-document
gestures do not refresh. Keyboard-visible input and an in-flight load also block
new refreshes. The Material indicator follows web appearance and ends when the
adapter reports completion, failure or cancelled navigation. The browser widget
and its persistent session stay mounted.

## References and platform boundary

- [Official controller scroll callback](https://pub.dev/documentation/webview_flutter/4.14.1/webview_flutter/WebViewController/setOnScrollPositionChange.html)
- [Flutter pointer listener](https://api.flutter.dev/flutter/widgets/Listener-class.html)
- [Material refresh indicator](https://api.flutter.dev/flutter/material/RefreshProgressIndicator-class.html)

Use the pinned Flutter 3.44.6 / Dart 3.12.2 toolchain. This is Android hosting
behavior; the shared website remains the product interface. Installed Android
apps require a rebuilt native binary to receive this feature. The web update
alone cannot add a native gesture observer to an existing installation.

## Verification

Widget tests exercise release timing, single in-flight refresh, loading
completion, child taps/scrolling, short/upward/horizontal/mouse/cancelled gestures,
multi-touch, keyboard-visible input and top-of-page eligibility. A shell test
checks that refresh reuses the existing adapter. Final command results are
recorded in the tracker. No Android device was connected during initial
implementation; physical WebView gesture acceptance must remain explicit.

Final checks: `flutter analyze --no-pub` passed with no issues; all 57 Flutter
tests passed. The Android development APK built successfully with Flutter
3.44.6 in 415.4s using the installed JDK 17, project-local Java temporary
directory and process-local Kotlin incremental-build workaround documented in
the README. The build emitted the existing SDK XML-version warning and exited
successfully. Its development origin is `http://192.168.1.148:3000`.
