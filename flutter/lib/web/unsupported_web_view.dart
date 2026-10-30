import 'package:flutter/widgets.dart';

import 'web_view_adapter.dart';
import 'web_view_failure.dart';

/// Keep unverified targets explicit instead of silently opening another app.
class UnsupportedWebViewAdapter extends WebViewAdapter {
  @override
  bool get ready => false;
  @override
  bool get loading => false;
  @override
  bool get canGoBack => false;
  @override
  String get error =>
      'The embedded browser is not available on this platform yet.';
  @override
  WebViewFailure get failure => WebViewFailure.browser;
  @override
  Widget buildView() => const SizedBox.shrink();
  @override
  Future<void> initialize() async {}
  @override
  Future<void> load(Uri uri) async {}
  @override
  Future<void> reload() async {}
  @override
  Future<void> goBack() async {}
  @override
  Future<void> resume() async {}
}
