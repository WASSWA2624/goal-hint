import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:goal_hint/web/system_web_view.dart';
import 'package:goal_hint/web/web_view_adapter.dart';
import 'package:goal_hint/web/windows_web_view.dart';

/// Test-only DOM inspection through the real platform controller.
///
/// Nothing here is registered with web content or shipped as a native bridge.
class NativePage {
  NativePage(this.tester, this.adapter);

  final WidgetTester tester;
  final WebViewAdapter adapter;

  Future<Object?> execute(String source) => switch (adapter) {
    SystemWebViewAdapter system =>
      system.controller!.runJavaScriptReturningResult(source),
    WindowsWebViewAdapter windows => windows.controller!.evaluateJavascript(
      source: source,
    ),
    _ => throw UnsupportedError(
      'Run native acceptance on an implemented platform.',
    ),
  };

  Future<dynamic> read(String expression) async {
    dynamic value = await execute('JSON.stringify({ value: ($expression) })');
    for (var i = 0; i < 2 && value is String; i++) {
      try {
        value = jsonDecode(value);
      } on FormatException {
        break;
      }
    }
    return (value as Map)['value'];
  }

  /// Resolves browser promises without assuming the native engine awaits them.
  Future<dynamic> readAsync(
    String expression, {
    Duration timeout = const Duration(seconds: 40),
  }) async {
    await execute('''
      window.__goalHintAcceptanceProbe = null;
      Promise.resolve(($expression)).then(
        value => { window.__goalHintAcceptanceProbe = { value }; },
        () => { window.__goalHintAcceptanceProbe = { failed: true }; }
      );
      true;
    ''');
    await until('window.__goalHintAcceptanceProbe != null', timeout: timeout);
    final result = await read('window.__goalHintAcceptanceProbe') as Map;
    expect(result['failed'], isNot(true), reason: 'Browser promise failed.');
    return result['value'];
  }

  Future<void> until(
    String expression, {
    Duration timeout = const Duration(seconds: 40),
  }) async {
    final deadline = DateTime.now().add(timeout);
    while (DateTime.now().isBefore(deadline)) {
      try {
        if (await read(expression) == true) return;
      } catch (_) {
        // Full-document navigation briefly replaces the JavaScript context.
      }
      await tester.pump(const Duration(milliseconds: 200));
    }
    fail(
      'Embedded page did not satisfy: $expression; '
      'adapter error: ${adapter.error}; ${await publicLocation()}',
    );
  }

  Future<String> publicLocation() async {
    try {
      final location = await read(
        '({ href: location.href, historyLength: history.length, historyKeys: Object.keys(history.state ?? {}), visibility: document.visibilityState, offlineCache: document.documentElement.dataset.offlineCache, offlineVersion: document.documentElement.dataset.offlineVersion })',
      ).timeout(const Duration(seconds: 3));
      return '$location; ready: ${adapter.ready}; loading: ${adapter.loading}; canGoBack: ${adapter.canGoBack}';
    } catch (_) {
      return 'Document location unavailable; ready: ${adapter.ready}; loading: ${adapter.loading}; canGoBack: ${adapter.canGoBack}';
    }
  }

  Future<void> untilAdapter(bool Function() ready) async {
    final deadline = DateTime.now().add(const Duration(seconds: 15));
    while (!ready() && DateTime.now().isBefore(deadline)) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    if (!ready()) {
      fail('Native adapter did not become ready: ${await publicLocation()}');
    }
  }

  Future<void> documentReady() async {
    await until('document.readyState === "complete"');
    await untilAdapter(() => !adapter.loading);
  }

  Future<void> nativeBack() async {
    if (Platform.isAndroid) {
      // Commit canGoBack into PopScope before dispatching framework Back.
      await tester.pump();
      await tester.binding.handlePopRoute();
    } else {
      await adapter.goBack();
    }
  }
}
