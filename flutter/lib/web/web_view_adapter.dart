import 'package:flutter/widgets.dart';
import 'dart:async';

import 'web_appearance.dart';
import 'web_view_failure.dart';

/// The native browser boundary. Routes, accounts and data remain in Next.js.
abstract class WebViewAdapter extends ChangeNotifier {
  bool get ready;
  bool get hasDocument => false;
  bool get loading;
  bool get canGoBack;
  String? get error;
  WebViewFailure? get failure =>
      error == null ? null : WebViewFailure.connection;
  WebAppearance? get appearance => null;
  bool get supportsPullToRefresh => false;
  bool get atTop => false;
  WebThemePreference? _pendingTheme;
  bool _applyingTheme = false;

  void requestThemePreference(WebThemePreference value) {
    _pendingTheme = value;
    unawaited(applyPendingTheme());
  }

  Future<void> applyPendingTheme() async {
    final pending = _pendingTheme;
    if (pending == null || _applyingTheme) return;
    _applyingTheme = true;
    try {
      if (await updateWebTheme(pending) && _pendingTheme == pending) {
        _pendingTheme = null;
      }
    } catch (_) {
      /* Retry when an owned application document is ready. */
    } finally {
      _applyingTheme = false;
      if (_pendingTheme != null && _pendingTheme != pending) {
        unawaited(applyPendingTheme());
      }
    }
  }

  @protected
  Future<bool> updateWebTheme(WebThemePreference value) async => false;

  Widget buildView();
  Future<void> initialize();
  Future<void> load(Uri uri);
  Future<void> reload();
  Future<void> goBack();

  /// Reconcile browser state without reloading or discarding an unfinished form.
  Future<void> resume();

  /// Hide/pause the browser and commit its store where supported by the host.
  Future<void> suspend() async {}
}
