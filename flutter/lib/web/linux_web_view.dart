import 'dart:async';

import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';

import '../config/app_config.dart';
import 'app_user_agent.dart';
import 'navigation_policy.dart';
import 'web_view_adapter.dart';
import 'web_view_failure.dart';

/// The GTK runner presents its WebKitGTK surface in the same window.
class LinuxWebViewAdapter extends WebViewAdapter {
  LinuxWebViewAdapter({
    required this.configuration,
    required this.navigationPolicy,
    required this.openExternal,
  });

  final AppConfig configuration;
  final NavigationPolicy navigationPolicy;
  final Future<bool> Function(Uri) openExternal;
  static const _channel = MethodChannel(
    'com.goalhint.goal_hint/linux_web_view',
  );

  @override
  bool ready = false;
  @override
  bool hasDocument = false;
  @override
  bool loading = false;
  @override
  bool canGoBack = false;
  @override
  String? get error => failure?.name;
  @override
  WebViewFailure? failure;
  bool _disposed = false;

  @override
  Widget buildView() => const SizedBox.expand();

  @override
  Future<void> initialize() async {
    _channel.setMethodCallHandler(_handleBrowserMessage);
    final userAgent = await installedAppUserAgent(
      '',
      'linux',
      configuration.environment,
    );
    if (_disposed) return;
    await _channel.invokeMethod<void>('initialize', userAgent.trim());
    if (_disposed) return;
    ready = true;
    notifyListeners();
  }

  Future<Object?> _handleBrowserMessage(MethodCall call) async {
    if (_disposed) return null;
    switch (call.method) {
      case 'navigation':
        final navigation = call.arguments as Map<Object?, Object?>;
        final address = navigation['address'] as String;
        final action = navigationPolicy.evaluate(address);
        if (action == NavigationAction.external &&
            navigation['userGesture'] == true) {
          unawaited(openExternal(Uri.parse(address)));
        }
        return action == NavigationAction.allow;
      case 'state':
        final state = call.arguments as Map<Object?, Object?>;
        loading = state['loading'] == true;
        hasDocument = state['hasDocument'] == true;
        canGoBack = state['canGoBack'] == true;
        failure = switch (state['failure']) {
          'connection' => WebViewFailure.connection,
          'secureConnection' => WebViewFailure.secureConnection,
          'browser' => WebViewFailure.browser,
          _ => null,
        };
        notifyListeners();
        return null;
      default:
        throw MissingPluginException(call.method);
    }
  }

  @override
  Future<void> load(Uri uri) async {
    if (navigationPolicy.evaluate(uri.toString()) != NavigationAction.allow) {
      throw ArgumentError('The web document must use the configured origin.');
    }
    await _channel.invokeMethod<void>('load', uri.toString());
  }

  @override
  Future<void> reload() => _channel.invokeMethod<void>('reload');

  @override
  Future<void> goBack() => _channel.invokeMethod<void>('goBack');

  @override
  Future<void> resume() async {}

  @override
  void dispose() {
    _disposed = true;
    _channel.setMethodCallHandler(null);
    super.dispose();
  }
}
