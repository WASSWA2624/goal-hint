import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_inappwebview_platform_interface/flutter_inappwebview_platform_interface.dart'
    hide NavigationAction;
import 'package:flutter_inappwebview_windows/flutter_inappwebview_windows.dart';
import 'package:path/path.dart' as path;
import 'package:path_provider/path_provider.dart';

import '../config/app_config.dart';
import '../config/app_branding.dart';
import 'navigation_policy.dart';
import 'web_appearance.dart';
import 'web_view_adapter.dart';
import 'web_view_failure.dart';

/// WebView2 host; web sessions live only in its persistent browser profile.
class WindowsWebViewAdapter extends WebViewAdapter {
  WindowsWebViewAdapter({
    required this.configuration,
    required this.navigationPolicy,
    required this.openExternal,
  });

  final AppConfig configuration;
  final NavigationPolicy navigationPolicy;
  final Future<bool> Function(Uri) openExternal;

  WindowsWebViewEnvironment? _environment;
  WindowsInAppWebViewWidget? _view;
  PlatformInAppWebViewController? _controller;
  Uri? _currentUri;
  Uri? _pendingUri;
  bool _loading = true;
  bool _hasDocument = false;
  bool _canGoBack = false;
  WebViewFailure? _failure;
  bool _disposed = false;
  bool _hidden = false;
  WebAppearance? _appearance;
  late final _appearanceQuery = webAppearanceQuery(configuration.origin);
  late final _appearanceSampler = WebAppearanceSampler(
    read: () => _controller!.evaluateJavascript(source: _appearanceQuery),
    onChanged: (value) {
      _appearance = value;
      _notify();
    },
  );

  /// Native-controller access for integration checks, never exposed to the page.
  PlatformInAppWebViewController? get controller => _controller;
  Uri? get currentUri => _currentUri;

  @override
  bool get ready => _view != null;
  @override
  bool get hasDocument => _hasDocument;
  @override
  bool get loading => _loading;
  @override
  bool get canGoBack => _canGoBack;
  @override
  String? get error => _failure?.message(const AppBranding().name);
  @override
  WebViewFailure? get failure => _failure;
  @override
  WebAppearance? get appearance => _appearance;

  @override
  Future<void> initialize() async {
    if (_disposed || ready) return;
    try {
      PlatformInAppWebViewController.debugLoggingSettings =
          DebugLoggingSettings(enabled: false);
      PlatformWebViewEnvironment.debugLoggingSettings = DebugLoggingSettings(
        enabled: false,
      );
      final nativeEnvironment = WindowsWebViewEnvironment.static();
      if (await nativeEnvironment.getAvailableVersion() == null) {
        _fail(WebViewFailure.browser);
        return;
      }
      final support = await getApplicationSupportDirectory();
      final profile = Directory(
        path.join(support.path, 'webview2', configuration.environment.name),
      );
      await profile.create(recursive: true);
      final environment = await nativeEnvironment.create(
        settings: WebViewEnvironmentSettings(userDataFolder: profile.path),
      );
      if (_disposed) {
        await environment.dispose();
        return;
      }
      _environment = environment;
      _view = WindowsInAppWebViewWidget(
        WindowsInAppWebViewWidgetCreationParams(
          webViewEnvironment: environment,
          initialSettings: _ShellWebViewSettings(configuration.origin),
          onWebViewCreated: (controller) {
            if (_disposed) return;
            _controller = controller;
            unawaited(load(_pendingUri ?? configuration.origin));
          },
          onLoadStart: (_, address) {
            if (_disposed || address == null) return;
            if (navigationPolicy.evaluate(address.toString()) !=
                NavigationAction.allow) {
              return;
            }
            _currentUri = Uri.tryParse(address.toString());
            if (_currentUri != null && !isHostingInterstitial(_currentUri!)) {
              _pendingUri = _currentUri;
            }
            _loading = _failure == null;
            _notify();
          },
          onLoadStop: (_, address) async {
            if (_disposed) return;
            _remember(address);
            if (_failure == null &&
                address != null &&
                navigationPolicy.evaluate(address.toString()) ==
                    NavigationAction.allow) {
              try {
                final health = webScriptScalar(
                  await _controller?.evaluateJavascript(
                    source: webDocumentHealthQuery(configuration.origin),
                  ),
                );
                if (health == 'unavailable') {
                  _fail(WebViewFailure.unavailable);
                  return;
                }
              } catch (_) {
                /* Keep unknown documents web-owned. */
              }
              await applyPendingTheme();
            }
            if (_disposed) return;
            if (_failure == null &&
                address != null &&
                navigationPolicy.evaluate(address.toString()) ==
                    NavigationAction.allow) {
              _hasDocument = true;
            }
            _loading = false;
            await _updateHistory();
          },
          onUpdateVisitedHistory: (_, address, _) async {
            _remember(address);
            await _updateHistory();
          },
          shouldOverrideUrlLoading: (_, action) async {
            final address = action.request.url?.toString();
            if (address == null || _disposed) {
              return NavigationActionPolicy.CANCEL;
            }
            final decision = navigationPolicy.evaluate(address);
            if (decision == NavigationAction.allow) {
              final uri = Uri.tryParse(address);
              if (action.isForMainFrame &&
                  uri != null &&
                  !isHostingInterstitial(uri)) {
                _pendingUri = uri;
              }
              if (action.isForMainFrame && _failure != null) {
                _failure = null;
                _loading = true;
                _notify();
              }
              return NavigationActionPolicy.ALLOW;
            }
            if (action.isForMainFrame) {
              _loading = false;
              _notify();
              if (decision == NavigationAction.external) {
                await openExternal(Uri.parse(address));
              }
            }
            return NavigationActionPolicy.CANCEL;
          },
          // The vendored native guard handles this callback without creating a
          // second browser or retaining an incomplete WebView2 deferral.
          onCreateWindow: (_, action) async {
            final address = action.request.url?.toString();
            if (address == null || _disposed) return true;
            switch (navigationPolicy.evaluate(address)) {
              case NavigationAction.allow:
                await load(Uri.parse(address));
              case NavigationAction.external:
                await openExternal(Uri.parse(address));
              case NavigationAction.block:
                break;
            }
            return true;
          },
          onReceivedError: (_, request, error) {
            if (request.isForMainFrame == true &&
                error.type != WebResourceErrorType.CANCELLED) {
              _fail(
                error.type == WebResourceErrorType.TIMEOUT
                    ? WebViewFailure.timeout
                    : _secureErrors.contains(error.type)
                    ? WebViewFailure.secureConnection
                    : WebViewFailure.connection,
              );
            }
          },
          onReceivedHttpError: (_, request, response) async {
            // Application 4xx pages and authorization stay owned by Next.js.
            if (request.isForMainFrame != true) return;
            final status = response.statusCode ?? 0;
            if (status >= 500) {
              _fail(WebViewFailure.unavailable);
            } else if (status >= 400 &&
                navigationPolicy.evaluate(request.url.toString()) ==
                    NavigationAction.allow) {
              try {
                final health = webScriptScalar(
                  await _controller?.evaluateJavascript(
                    source: webDocumentHealthQuery(configuration.origin),
                  ),
                );
                if (_disposed) return;
                if (health == 'unavailable') {
                  _fail(WebViewFailure.unavailable);
                  return;
                }
              } catch (_) {
                /* Preserve ordinary web-owned 4xx responses. */
              }
              await applyPendingTheme();
              if (_disposed) return;
              _hasDocument = true;
              _loading = false;
              _notify();
            }
          },
          onReceivedServerTrustAuthRequest: (_, _) async {
            // Main-document failures are reported by onReceivedError; a bad
            // subresource certificate must not replace the application page.
            return ServerTrustAuthResponse(
              action: ServerTrustAuthResponseAction.CANCEL,
            );
          },
          onPermissionRequest: (_, request) async => PermissionResponse(
            resources: request.resources,
            action: PermissionResponseAction.DENY,
          ),
        ),
      );
      _failure = null;
      _notify();
    } catch (_) {
      _fail(WebViewFailure.browser);
    }
  }

  @override
  Widget buildView() {
    final view = _view;
    return view == null
        ? const SizedBox.expand()
        : Builder(builder: view.build);
  }

  @override
  Future<bool> updateWebTheme(WebThemePreference value) async {
    if (_disposed || _controller == null) return false;
    final result = await _controller!.evaluateJavascript(
      source: webThemePreferenceScript(configuration.origin, value),
    );
    final applied = webScriptScalar(result) == true;
    if (applied) _appearanceSampler.refresh();
    return applied;
  }

  @override
  Future<void> load(Uri uri) async {
    if (_disposed) return;
    if (navigationPolicy.evaluate(uri.toString()) != NavigationAction.allow) {
      _fail(WebViewFailure.browser);
      return;
    }
    _pendingUri = uri;
    if (!ready) return;
    _loading = true;
    _failure = null;
    _notify();
    try {
      await _controller?.loadUrl(
        urlRequest: URLRequest(url: WebUri(uri.toString())),
      );
      // The native widget can attach after a hidden startup. Navigation may
      // resume the engine, so apply the remembered visibility after loading.
      if (_hidden && !_disposed) await _controller?.pause();
    } catch (_) {
      _fail(WebViewFailure.connection);
    }
  }

  @override
  Future<void> reload() async {
    if (_disposed) return;
    if (!ready) await initialize();
    if (_controller == null || _failure != null) {
      await load(_pendingUri ?? _currentUri ?? configuration.origin);
      return;
    }
    _loading = true;
    _failure = null;
    _notify();
    try {
      await _controller!.reload();
    } catch (_) {
      _fail(WebViewFailure.connection);
    }
  }

  @override
  Future<void> goBack() async {
    if (_disposed || !_canGoBack) return;
    _failure = null;
    _loading = true;
    _notify();
    try {
      await _controller?.goBack();
      if (!_disposed) await _updateHistory();
    } catch (_) {
      // A native view can close while its back action is still in flight.
    }
  }

  @override
  Future<void> suspend() async {
    if (_disposed) return;
    _hidden = true;
    _syncAppearance();
    await _controller?.pause();
  }

  @override
  Future<void> resume() async {
    if (_disposed) return;
    _hidden = false;
    await _controller?.resume();
    await _updateHistory();
    _syncAppearance();
  }

  void _remember(WebUri? address) {
    if (!_disposed &&
        address != null &&
        navigationPolicy.evaluate(address.toString()) ==
            NavigationAction.allow) {
      _currentUri = Uri.tryParse(address.toString());
    }
  }

  Future<void> _updateHistory() async {
    if (_disposed) return;
    try {
      final back = await _controller?.canGoBack() ?? false;
      if (_disposed) return;
      _canGoBack = back;
      _notify();
    } catch (_) {
      // A close/dispose race does not turn the current web page into an error.
    }
  }

  static final _secureErrors = {
    WebResourceErrorType.FAILED_SSL_HANDSHAKE,
    WebResourceErrorType.SECURE_CONNECTION_FAILED,
    WebResourceErrorType.SERVER_CERTIFICATE_HAS_BAD_DATE,
    WebResourceErrorType.SERVER_CERTIFICATE_HAS_UNKNOWN_ROOT,
    WebResourceErrorType.SERVER_CERTIFICATE_NOT_YET_VALID,
    WebResourceErrorType.SERVER_CERTIFICATE_UNTRUSTED,
  };

  void _fail(WebViewFailure failure) {
    if (_disposed) return;
    _failure = failure;
    _hasDocument = false;
    _loading = false;
    _notify();
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
          _currentUri != null &&
          navigationPolicy.evaluate(_currentUri.toString()) ==
              NavigationAction.allow,
    );
  }

  @override
  void dispose() {
    _disposed = true;
    _appearanceSampler.dispose();
    _view?.dispose();
    final environment = _environment;
    if (environment != null) unawaited(environment.dispose());
    super.dispose();
  }
}

/// Extra keys are handled only by the pinned Windows native security patch.
class _ShellWebViewSettings extends InAppWebViewSettings {
  _ShellWebViewSettings(this.origin)
    : super(
        javaScriptEnabled: true,
        transparentBackground: true,
        useShouldOverrideUrlLoading: true,
        isInspectable: kDebugMode,
        incognito: false,
      );

  final Uri origin;

  @override
  Map<String, dynamic> toMap() => {
    ...super.toMap(),
    'trustedOrigin': origin.toString(),
    'javaScriptBridgeEnabled': false,
  };
}
