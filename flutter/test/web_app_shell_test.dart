import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:goal_hint/app.dart';
import 'package:goal_hint/config/app_config.dart';
import 'package:goal_hint/web/startup_loading.dart';
import 'package:goal_hint/web/web_view_pull_to_refresh.dart';

import 'support/fake_web_view.dart';

void main() {
  final configuration = AppConfig.resolve(isDebugBuild: true, isAndroid: false);

  testWidgets(
    'a supported top pull reloads the existing browser without replacing it',
    (tester) async {
      final browser = FakeWebViewAdapter()..supportsPullToRefresh = true;
      await tester.pumpWidget(
        GoalHintApp(configuration: configuration, webViewAdapter: browser),
      );
      await tester.pumpAndSettle();
      await tester.drag(
        find.byType(WebViewPullToRefresh),
        const Offset(0, 160),
      );
      await tester.pumpAndSettle();
      expect(browser.reloads, 1);
      expect(browser.disposed, isFalse);
      expect(find.text('Embedded web application'), findsOneWidget);
    },
  );

  testWidgets('white branded loading stays until the first document is ready', (
    tester,
  ) async {
    final browser = FakeWebViewAdapter()
      ..hasDocument = false
      ..loading = true;
    await tester.pumpWidget(
      GoalHintApp(configuration: configuration, webViewAdapter: browser),
    );
    await tester.pump(const Duration(milliseconds: 200));
    expect(find.byType(StartupLoading), findsOneWidget);
    expect(find.text('Goal Hint'), findsOneWidget);
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
    expect(
      tester
          .widget<ColoredBox>(
            find
                .descendant(
                  of: find.byType(StartupLoading),
                  matching: find.byType(ColoredBox),
                )
                .first,
          )
          .color,
      Colors.white,
    );
    browser.finishDocument();
    await tester.pumpAndSettle();
    expect(find.byType(StartupLoading), findsNothing);
    expect(find.text('Embedded web application'), findsOneWidget);
    expect(browser.disposed, isFalse);
  });

  testWidgets('loading supports enlarged text and reduced motion', (
    tester,
  ) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(320, 240);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.view.resetPhysicalSize);
    await tester.pumpWidget(
      const MaterialApp(
        home: MediaQuery(
          data: MediaQueryData(
            disableAnimations: true,
            textScaler: TextScaler.linear(2),
          ),
          child: Scaffold(body: StartupLoading()),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Goal Hint'), findsOneWidget);
    expect(find.text('Loading…'), findsOneWidget);
    expect(find.byType(CircularProgressIndicator), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('load failures offer retry without replacing the browser', (
    tester,
  ) async {
    final browser = FakeWebViewAdapter()
      ..error = 'Check your connection and try again.';
    await tester.pumpWidget(
      GoalHintApp(configuration: configuration, webViewAdapter: browser),
    );
    await tester.pumpAndSettle();
    expect(find.text('Unable to load Goal Hint'), findsOneWidget);
    expect(find.text('Embedded web application'), findsOneWidget);
    await tester.tap(find.text('Retry'));
    await tester.pumpAndSettle();
    expect(browser.reloads, 1);
    expect(browser.disposed, isFalse);
    expect(find.text('Unable to load Goal Hint'), findsNothing);
  });

  testWidgets('native back uses browser history before leaving the shell', (
    tester,
  ) async {
    final browser = FakeWebViewAdapter()..canGoBack = true;
    await tester.pumpWidget(
      GoalHintApp(configuration: configuration, webViewAdapter: browser),
    );
    await tester.pumpAndSettle();
    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    expect(browser.backs, 1);
    expect(find.text('Embedded web application'), findsOneWidget);
  });

  testWidgets(
    'hidden and paused coalesce and resume follows pending suspension',
    (tester) async {
      final browser = _DelayedLifecycleBrowser();
      await tester.pumpWidget(
        GoalHintApp(configuration: configuration, webViewAdapter: browser),
      );
      await tester.pumpAndSettle();
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await tester.pump();
      expect(browser.suspends, 1);
      expect(browser.resumes, 0);
      browser.suspension.complete();
      await tester.pump();
      expect(browser.resumes, 1);
      expect(browser.reloads, 0);
    },
  );

  testWidgets(
    'hidden startup reaches the initialized browser and disposed work is skipped',
    (tester) async {
      final browser = _DelayedLifecycleBrowser(delayInitialization: true);
      await tester.pumpWidget(
        GoalHintApp(configuration: configuration, webViewAdapter: browser),
      );
      await tester.pump();
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
      expect(browser.suspends, 0);
      browser.initialization.complete();
      await tester.pump();
      expect(browser.suspends, 1);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await tester.pumpWidget(const SizedBox.shrink());
      browser.suspension.complete();
      await tester.pump();
      expect(browser.resumes, 0);
      expect(browser.disposed, isTrue);
    },
  );

  testWidgets(
    'resume preserves form and browser state, disposal releases adapter',
    (tester) async {
      final browser = FakeWebViewAdapter();
      await tester.pumpWidget(
        GoalHintApp(configuration: configuration, webViewAdapter: browser),
      );
      await tester.pumpAndSettle();
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await tester.pump();
      expect(browser.resumes, 1);
      expect(browser.suspends, 1);
      expect(browser.reloads, 0);
      await tester.pumpWidget(const SizedBox.shrink());
      expect(browser.disposed, isTrue);
    },
  );
}

class _DelayedLifecycleBrowser extends FakeWebViewAdapter {
  _DelayedLifecycleBrowser({this.delayInitialization = false});

  final bool delayInitialization;
  final initialization = Completer<void>();
  final suspension = Completer<void>();

  @override
  Future<void> initialize() async {
    if (delayInitialization) await initialization.future;
  }

  @override
  Future<void> suspend() async {
    suspends++;
    await suspension.future;
  }
}
