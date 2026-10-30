import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:goal_hint/app.dart';
import 'package:goal_hint/config/app_config.dart';
import 'package:goal_hint/web/native_recovery_view.dart';
import 'package:goal_hint/web/navigation_policy.dart';
import 'package:goal_hint/web/web_view_factory.dart';
import 'package:goal_hint/web/windows_web_view.dart';
import 'package:integration_test/integration_test.dart';

import 'support/native_page.dart';

/// Native error/retry acceptance against a synthetic, loopback-only HTTP server.
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets(
    'unreachable, aborted and unavailable documents recover in the same browser',
    (tester) async {
      final reservation = await ServerSocket.bind(
        InternetAddress.loopbackIPv4,
        0,
      );
      final port = reservation.port;
      await reservation.close();
      final config = AppConfig.resolve(
        isDebugBuild: true,
        isAndroid: false,
        developmentOrigin: 'http://127.0.0.1:$port',
      );
      final browser =
          createWebViewAdapter(
                configuration: config,
                navigationPolicy: NavigationPolicy(config.origin),
                openExternal: (_) async => false,
              )
              as WindowsWebViewAdapter;
      final page = NativePage(tester, browser);
      HttpServer? server;
      var mode = 'ready';
      await tester.pumpWidget(
        GoalHintApp(configuration: config, webViewAdapter: browser),
      );
      try {
        await page.untilAdapter(() => browser.error != null);
        await tester.pumpAndSettle();
        expect(find.text('Connection interrupted'), findsOneWidget);
        final controller = browser.controller;
        expect(controller, isNotNull);
        void hiddenBrowser() {
          expect(
            tester
                .widget<Visibility>(
                  find.byKey(const ValueKey('native-browser-surface')),
                )
                .visible,
            isFalse,
          );
          expect(find.textContaining('127.0.0.1'), findsNothing);
        }

        hiddenBrowser();
        server = await HttpServer.bind(InternetAddress.loopbackIPv4, port);
        server.listen((request) async {
          if (mode == 'abort') {
            final socket = await request.response.detachSocket(
              writeHeaders: false,
            );
            socket.destroy();
            return;
          }
          if (mode == 'unavailable') {
            request.response.statusCode = HttpStatus.serviceUnavailable;
          }
          request.response.headers.contentType = ContentType.html;
          request.response.write(
            '<!doctype html><title>Recovery fixture</title><body data-recovery-ready="true">Goal Hint test page</body>',
          );
          await request.response.close();
        });
        await tester.tap(find.text('Try again'));
        await page.until('document.body.dataset.recoveryReady === "true"');
        await page.untilAdapter(
          () =>
              browser.hasDocument && !browser.loading && browser.error == null,
        );
        await tester.pumpAndSettle();
        expect(find.byType(NativeRecoveryView), findsNothing);
        expect(browser.controller, same(controller));

        for (final fault in ['abort', 'unavailable']) {
          mode = fault;
          final target = config.origin.resolve('/$fault');
          await browser.load(target);
          await page.untilAdapter(() => browser.error != null);
          await tester.pumpAndSettle();
          expect(
            find.text(
              fault == 'abort'
                  ? 'Connection interrupted'
                  : 'We’ll be back shortly',
            ),
            findsOneWidget,
          );
          hiddenBrowser();
          mode = 'ready';
          await tester.tap(find.text('Try again'));
          await page.until(
            'document.body.dataset.recoveryReady === "true" && location.pathname === "/$fault"',
          );
          await page.untilAdapter(
            () =>
                browser.hasDocument &&
                !browser.loading &&
                browser.error == null,
          );
          await tester.pumpAndSettle();
          expect(find.byType(NativeRecoveryView), findsNothing);
          expect(browser.currentUri, target);
          expect(browser.controller, same(controller));
        }
      } finally {
        await tester.pumpWidget(const SizedBox.shrink());
        await server?.close(force: true);
      }
    },
    skip: !Platform.isWindows,
  );
}
