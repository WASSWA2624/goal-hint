# Goal Hint Windows WebView2 integration patch

This directory vendors **flutter_inappwebview_windows 0.6.0**, published by
inappwebview.dev, under its preserved [Apache 2.0 license](LICENSE). It is an
application-local path dependency, not a separately published plugin.

Only the runtime implementation and native policy test are tracked here.
Upstream example applications and top-level package tests are not needed by the
host and are ignored without deleting local copies. Original runtime formatting
is preserved; the repository scopes trailing-space checks around this vendored
source while keeping application-code checks strict.

- [Published package](https://pub.dev/packages/flutter_inappwebview_windows/versions/0.6.0)
- [Exact source archive](https://pub.dev/api/archives/flutter_inappwebview_windows-0.6.0.tar.gz)
- Archive SHA-256: `8b4d3a46078a2cdc636c4a3d10d10f2a16882f6be607962dbfff8874d1642055`
- [Upstream repository](https://github.com/pichillilorenzo/flutter_inappwebview/tree/master/flutter_inappwebview_windows)

## Why a local patch is necessary

In the released source, `shouldOverrideUrlLoading` relies on the DevTools Fetch
Document event. `NavigationStarting` always permits navigation. Non-network
schemes cannot therefore be gated by the documented Dart callback. The other
released Windows candidate, `webview_windows 0.4.0`, does not expose a cancellable
navigation delegate. The upstream popup fallback also navigates the current
browser when `onCreateWindow` is unhandled, and a handled popup expects another
WebView to consume its retained deferral.

Goal Hint needs a single browser restricted to its configured application
origin, safe external links, and no page-to-native JavaScript bridge. Keeping a
small reviewed patch in source makes the installed behavior reproducible without
editing a developer's Pub cache or generated build output.

## Local changes

- `windows/utils/trusted_origin.h` uses Windows `CreateUri`/`IUri` to parse and
  compare the full HTTP(S) scheme, host, and effective port. It rejects credentials
  and malformed/unsafe schemes; there are no hostname prefix/suffix checks.
- `windows/in_app_webview/in_app_webview_settings.{h,cpp}` accepts the optional
  `trustedOrigin` and `javaScriptBridgeEnabled` creation settings.
- `windows/in_app_webview/in_app_webview.cpp` cancels off-origin/unsafe main-frame
  and frame navigation before loading when a trusted origin is configured.
  Cancelled main-frame destinations reach the existing Dart navigation delegate
  solely for external-link decisions; its response cannot bypass native refusal.
  Cancelled redirects are removed from the pending navigation-error map so an
  intentional external handoff does not become a connectivity error.
  Shell popups are marked handled immediately and routed to the existing Dart
  callback, without creating another browser or retaining a deferral.
- Main-document TLS failures now reach the existing `onReceivedError` callback;
  upstream's SSL-error exclusion otherwise leaves the loading state unresolved.
  Native certificate validation remains enabled and no certificate is accepted
  by the application. Subresource TLS failures do not replace the whole page.
  `lib/src/in_app_webview/in_app_webview_controller.dart` safely maps unsupported
  native error codes to `UNKNOWN` while preserving the description: the shared
  enum does not represent WebView2 TLS statuses, and its default decoder throws.
- `lib/src/webview_environment/webview_environment.dart` binds the returned
  environment channel to the newly created environment's ID. Upstream used the
  static factory object's ID, causing `dispose` to reach a nonexistent channel
  and fail after the native test/app had otherwise finished successfully.
- The same native file omits the plugin script and WebMessage listener and
  disables WebView2 WebMessage APIs when the JavaScript bridge is disabled. The
  shell also disables host objects. The normal website's JavaScript remains
  enabled. No credentials or business logic cross a native bridge.
- `windows/CMakeLists.txt` links Windows `urlmon` and `oleaut32` for the parser.
  It uses C++20 privately for the plugin, allowing the installed modern MSVC/
  C++/WinRT toolchain to use standard coroutines. It also removes an unsupported
  `DEPENDS` argument from the upstream target-form custom command (CMake CMP0175).
- C++20 conformance fixes in `windows/utils/{util,string}.h` declare the dependent
  false template, correct mutable case-conversion helper signatures, remove an
  invalid return, and accept a moved accumulator in the string-join lambda.
  `windows/types/{rect,size_2d,permission_response,web_resource_response}.h` removes
  redundant in-class member qualification; equality operators are const.
- `windows/test/trusted_origin_test.cpp` exercises the actual native parser with
  20 trusted-route and adversarial-origin cases.

All other files retain the published source. The application adapter supplies
these settings in `lib/web/windows_web_view.dart`, disables release DevTools,
checks the installed WebView2 Runtime, and chooses a writable persistent profile
under the native application-support directory. Debug and production use separate
profile directories. Offline behavior is not implemented by persistent storage.

## Reproducing native policy tests

From a Visual Studio x64 Developer Command Prompt at `flutter/`:

```bat
mkdir .dart_tool\native-policy-checks
cl /nologo /EHsc /std:c++17 /W4 /WX packages\flutter_inappwebview_windows\windows\test\trusted_origin_test.cpp /Fe:.dart_tool\native-policy-checks\trusted_origin_test.exe /Fo:.dart_tool\native-policy-checks\trusted_origin_test.obj /link urlmon.lib oleaut32.lib
.dart_tool\native-policy-checks\trusted_origin_test.exe
```

Upgrading this dependency requires rechecking navigation (including non-network
schemes, redirects, and popups), bridge absence, native input/composition, cookie
persistence, and the documented upstream patch. Do not replace this path
dependency with an unpatched hosted release until those behaviors are verified.
