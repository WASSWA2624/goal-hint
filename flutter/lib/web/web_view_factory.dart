import 'package:flutter/foundation.dart';

import '../config/app_config.dart';
import 'navigation_policy.dart';
import 'system_web_view.dart';
import 'unsupported_web_view.dart';
import 'web_view_adapter.dart';
import 'windows_web_view.dart';

WebViewAdapter createWebViewAdapter({
  required AppConfig configuration,
  required NavigationPolicy navigationPolicy,
  required Future<bool> Function(Uri) openExternal,
}) {
  if (kIsWeb) return UnsupportedWebViewAdapter();
  return switch (defaultTargetPlatform) {
    TargetPlatform.android ||
    TargetPlatform.iOS ||
    TargetPlatform.macOS => SystemWebViewAdapter(
      configuration: configuration,
      navigationPolicy: navigationPolicy,
      openExternal: openExternal,
    ),
    TargetPlatform.windows => WindowsWebViewAdapter(
      configuration: configuration,
      navigationPolicy: navigationPolicy,
      openExternal: openExternal,
    ),
    _ => UnsupportedWebViewAdapter(),
  };
}
