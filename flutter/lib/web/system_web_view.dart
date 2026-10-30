import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';
import 'package:webview_flutter_wkwebview/webview_flutter_wkwebview.dart';

import '../config/app_config.dart';
import '../config/app_branding.dart';
import 'android_file_selector.dart';
import 'navigation_policy.dart';
import 'web_appearance.dart';
import 'web_view_adapter.dart';
import 'web_view_failure.dart';

/// Hosts the existing website in the platform's normal, persistent WebView.
class SystemWebViewAdapter extends WebViewAdapter {
  SystemWebViewAdapter({
    required this.configuration,
    required this.navigationPolicy,
    required this.openExternal,
  }) : _currentUri = configuration.origin;

  final AppConfig configuration;
  final NavigationPolicy navigationPolicy;
  final Future<bool> Function(Uri) openExternal;

  static const _browserStore = MethodChannel(
    'com.goalhint.goal_hint/browser_store',
  );

  WebViewController? _controller;
  Future<void>? _initialization;
  Uri _currentUri;
  bool _ready = false;
  bool _hasDocument = false;
  bool _loading = false;
  bool _canGoBack = false;
  bool _atTop = true;
  bool _disposed = false;
  bool _hidden = false;
  WebViewFailure? _failure;
  int _historyRequest = 0;
  WebAppearance? _appearance;
  late final _appearanceQuery = webAppearanceQuery(configuration.origin);
  late final _appearanceSampler = WebAppearanceSampler(
    read: () => _controller!.runJavaScriptReturningResult(_appearanceQuery),
    onChanged: (value) {
      _appearance = value;
      unawaited(_setBackground(value));
      _notify();
    },
  );

  /// Exposes the engine controller for native integration tests, not web code.
  @visibleForTesting
  WebViewController? get controller => _controller;

  @override
  bool get ready => _ready;

  @override
  bool get hasDocument => _hasDocument;

  @override
  bool get loading => _loading;

  @override
  bool get canGoBack => _canGoBack;

  @override
  bool get supportsPullToRefresh =>
      _controller?.platform is AndroidWebViewController;

  @override
  bool get atTop => _atTop;

  @override
  String? get error => _failure?.message(const AppBranding().name);

  @override
  WebViewFailure? get failure => _failure;

  @override
  WebAppearance? get appearance => _appearance;

  @override
  Future<void> initialize() {
    if (_disposed || _ready) return Future<void>.value();
    return _initialization ??= _initialize();
  }

  Future<void> _initialize() async {
    _loading = true;
    _failure = null;
    _notify();
    try {
      // Keep native browser construction from blocking the first branded frame.
      await WidgetsBinding.instance.waitUntilFirstFrameRasterized;
      if (_disposed) return;
      final params = WebViewPlatform.instance is WebKitWebViewPlatform
          ? WebKitWebViewControllerCreationParams(
              javaScriptCanOpenWindowsAutomatically: false,
            )
          : const PlatformWebViewControllerCreationParams();
      final controller = WebViewController.fromPlatformCreationParams(params);
      _controller = controller;
      await controller.setJavaScriptMode(JavaScriptMode.unrestricted);
      await controller.setNavigationDelegate(
        NavigationDelegate(
          onNavigationRequest: _navigate,
          onPageStarted: _pageStarted,
          onPageFinished: (url) async {
            if (_disposed || !sameWebDocument(Uri.parse(url), _currentUri)) {
              return;
            }
            if (_failure == null &&
                navigationPolicy.evaluate(url) == NavigationAction.allow) {
              await _normalizeLinkTargets();
              try {
                await _flushBrowserStore();
              } on Exception {
                // A storage failure must not hide a usable document. Explicit
                // suspension still reports failures to its caller.
              }
              if (_disposed || !sameWebDocument(Uri.parse(url), _currentUri)) {
                return;
              }
              if (_failure == null) _hasDocument = true;
            }
            if (_disposed) return;
            _loading = false;
            _notify();
            unawaited(_refreshHistory());
          },
          onUrlChange: (change) {
            if (_disposed) return;
            final url = change.url;
            if (url != null &&
                navigationPolicy.evaluate(url) == NavigationAction.allow) {
              _currentUri = Uri.parse(url);
            }
            unawaited(_refreshHistory());
          },
          onWebResourceError: (problem) {
            final failure = documentFailure(
              problem,
              _currentUri,
              webKit: controller.platform is WebKitWebViewController,
            );
            if (failure != null) _loadFailed(failure);
          },
          onHttpError: (problem) {
            // Android supplies the failed URI but not a main-frame flag. WK's
            // callback supplies neither, so its HTTP response stays web-owned.
            final uri = problem.request?.uri;
            final status = problem.response?.statusCode;
            if (status != null &&
                status >= 500 &&
                uri != null &&
                sameWebDocument(uri, _currentUri)) {
              _loadFailed(WebViewFailure.unavailable);
            }
          },
          onHttpAuthRequest: (request) => request.onCancel(),
          onSslAuthError: (request) async {
            // This callback has no frame identity. Cancel every bad certificate;
            // the main-frame resource-error callback reports document failures.
            try {
              await request.cancel();
            } catch (_) {
              // Never proceed after a failed certificate check.
            }
          },
        ),
      );
      if (controller.platform is AndroidWebViewController) {
        await controller.setOnScrollPositionChange((position) {
          if (_disposed) return;
          final atTop = position.y <= 0;
          if (_atTop == atTop) return;
          _atTop = atTop;
          _notify();
        });
        await (controller.platform as AndroidWebViewController)
            .setOnShowFileSelector(selectAndroidFiles);
        await AndroidWebViewController.enableDebugging(kDebugMode);
      } else if (controller.platform is WebKitWebViewController) {
        await (controller.platform as WebKitWebViewController)
            .setAllowsBackForwardNavigationGestures(true);
      }
      if (_disposed) return;
      _ready = true;
      _loading = false;
      _notify();
    } catch (_) {
      _loading = false;
      _failure = WebViewFailure.browser;
      _notify();
    } finally {
      _initialization = null;
    }
  }

  @override
  Widget buildView() => _ready && _controller != null
      ? WebViewWidget(controller: _controller!)
      : const SizedBox.shrink();

  @override
  Future<void> load(Uri uri) async {
    if (_disposed || !_ready) return;
    if (navigationPolicy.evaluate(uri.toString()) != NavigationAction.allow) {
      _loadFailed();
      return;
    }
    _currentUri = uri;
    await _load(() => _controller!.loadRequest(uri));
  }

  @override
  Future<void> reload() async {
    if (_disposed || !_ready) return;
    // A failed native document may have a browser-internal error-page URL.
    if (_failure != null) {
      await load(_currentUri);
    } else {
      await _load(() => _controller!.reload());
    }
  }

  @override
  Future<void> goBack() async {
    if (_disposed || !_ready) return;
    try {
      if (await _controller!.canGoBack()) {
        await _load(() => _controller!.goBack());
        await _refreshHistory();
      }
    } catch (_) {
      _loadFailed();
    }
  }

  @override
  Future<void> resume() async {
    if (_disposed) return;
    _hidden = false;
    _syncAppearance();
    await _refreshHistory();
  }

  @override
  Future<void> suspend() async {
    if (_disposed) return;
    _hidden = true;
    _syncAppearance();
    await _flushBrowserStore();
  }

  Future<void> _flushBrowserStore() async {
    if (_disposed ||
        !_ready ||
        _controller?.platform is! AndroidWebViewController) {
      return;
    }
    // This commits the native browser store; credentials stay in web cookies.
    await _browserStore.invokeMethod<void>('flushCookies');
  }

  Future<void> _load(Future<void> Function() operation) async {
    _loading = true;
    _failure = null;
    _notify();
    try {
      await operation();
    } catch (_) {
      _loadFailed();
    }
  }

  Future<NavigationDecision> _navigate(NavigationRequest request) async {
    if (_disposed) return NavigationDecision.prevent;
    final action = navigationPolicy.evaluate(request.url);
    if (request.isMainFrame && action != NavigationAction.allow) {
      // Cancelled redirects have no page-finished event to end the indicator.
      _loading = false;
      _notify();
    }
    switch (action) {
      case NavigationAction.allow:
        if (request.isMainFrame) {
          // A failed redirect can be reported before its page-start callback.
          _currentUri = Uri.parse(request.url);
          if (_failure != null) {
            _failure = null;
            _loading = true;
            _notify();
          }
        }
        return NavigationDecision.navigate;
      case NavigationAction.external:
        // A child-frame request must never launch another application.
        if (request.isMainFrame) {
          try {
            await openExternal(Uri.parse(request.url));
          } catch (_) {
            // The shell's launcher reports failures without hiding this page.
          }
        }
        return NavigationDecision.prevent;
      case NavigationAction.block:
        return NavigationDecision.prevent;
    }
  }

  void _pageStarted(String url) {
    if (_disposed || navigationPolicy.evaluate(url) != NavigationAction.allow) {
      return;
    }
    _currentUri = Uri.parse(url);
    _atTop = true;
    // Some engines emit a late start/finish for their built-in error document.
    // Only an explicit new navigation or retry clears the failure above.
    _loading = _failure == null;
    _notify();
  }

  Future<void> _refreshHistory() async {
    if (_disposed || !_ready) return;
    final request = ++_historyRequest;
    try {
      final canGoBack = await _controller!.canGoBack();
      if (_disposed || request != _historyRequest) return;
      if (_canGoBack != canGoBack) {
        _canGoBack = canGoBack;
        _notify();
      }
    } catch (_) {
      // A history query during native-view teardown is not a document failure.
    }
  }

  void _loadFailed([WebViewFailure failure = WebViewFailure.connection]) {
    if (_disposed) return;
    _loading = false;
    _failure = failure;
    _hasDocument = false;
    _notify();
  }

  Future<void> _normalizeLinkTargets() async {
    if (_disposed) return;
    try {
      // Official WK navigation requests cannot distinguish a new window from a
      // child frame. Normalize owned-page anchors before native policy runs,
      // including anchors added by Next.js navigation. This exposes no bridge.
      await _controller!.runJavaScript('''
(() => {
  const key = Symbol.for('goalHint.nativeLinkTargets');
  if (document[key]) return;
  document[key] = true;
  document.addEventListener('click', (event) => {
    const element = event.target instanceof Element ? event.target : null;
    const link = element?.closest('a');
    if (link?.target.toLowerCase() === '_blank') link.target = '_self';
  }, true);
})();
''');
    } catch (_) {
      // A document replaced during completion does not need a native error.
    }
  }

  void _notify() {
    if (_disposed) return;
    _syncAppearance();
    notifyListeners();
  }

  void _syncAppearance() {
    _appearanceSampler.setActive(
      !_disposed &&
          !_hidden &&
          !_loading &&
          _failure == null &&
          _hasDocument &&
          _controller != null &&
          navigationPolicy.evaluate(_currentUri.toString()) ==
              NavigationAction.allow,
    );
  }

  Future<void> _setBackground(WebAppearance value) async {
    if (_disposed || _controller == null) return;
    try {
      await _controller!.setBackgroundColor(value.background);
    } catch (_) {
      // A disposed view must not replace the last usable native appearance.
    }
  }

  @override
  void dispose() {
    _disposed = true;
    _appearanceSampler.dispose();
    ++_historyRequest;
    // Platform-view teardown owns native disposal; its normal browser store is
    // intentionally retained for server-managed cookies and web preferences.
    super.dispose();
  }
}
