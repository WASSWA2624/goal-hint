import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:goal_hint/web/native_appearance.dart';
import 'package:goal_hint/web/native_recovery_view.dart';
import 'package:goal_hint/web/web_view_failure.dart';
import 'package:goal_hint/config/app_branding.dart';
import 'package:goal_hint/config/app_config.dart';
import 'package:goal_hint/app.dart';

import 'support/fake_web_view.dart';

void main() {
  testWidgets(
    'recovery remains usable on small screens with large text in both themes',
    (tester) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = const Size(320, 568);
      addTearDown(tester.view.resetDevicePixelRatio);
      addTearDown(tester.view.resetPhysicalSize);
      var retries = 0;
      for (final brightness in Brightness.values) {
        for (final failure in WebViewFailure.values) {
          await tester.pumpWidget(
            MaterialApp(
              theme: nativeTheme(brightness),
              home: MediaQuery(
                data: const MediaQueryData(textScaler: TextScaler.linear(2)),
                child: Scaffold(
                  body: NativeRecoveryView(
                    failure: failure,
                    onRetry: () => retries++,
                  ),
                ),
              ),
            ),
          );
          await tester.pumpAndSettle();
          expect(find.text('Goal Hint'), findsOneWidget);
          expect(
            find.text(failure.title(const AppBranding().name)),
            findsOneWidget,
          );
          await tester.ensureVisible(find.text('Try again'));
          await tester.tap(find.text('Try again'));
          expect(tester.takeException(), isNull);
        }
      }
      expect(retries, 10);
    },
  );

  testWidgets('busy recovery disables retry and respects reduced motion', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: MediaQuery(
          data: const MediaQueryData(disableAnimations: true),
          child: Scaffold(
            body: NativeRecoveryView(
              failure: WebViewFailure.connection,
              busy: true,
              onRetry: () => fail('Busy retry must be disabled'),
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Reconnecting…'), findsOneWidget);
    expect(
      tester.widget<FilledButton>(find.byType(FilledButton)).onPressed,
      isNull,
    );
    expect(find.byType(CircularProgressIndicator), findsNothing);
  });

  testWidgets('recovery and startup read the configured name and logo', (
    tester,
  ) async {
    const branding = AppBranding(name: 'Match Signal');
    final configuration = AppConfig.resolve(
      isDebugBuild: true,
      isAndroid: false,
    );
    final browser = FakeWebViewAdapter()..error = 'private engine details';
    await tester.pumpWidget(
      GoalHintApp(
        configuration: configuration,
        branding: branding,
        webViewAdapter: browser,
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text(branding.name), findsOneWidget);
    expect(
      find.textContaining('We couldn’t reach ${branding.name}'),
      findsOneWidget,
    );
    expect(find.textContaining('Goal Hint'), findsNothing);
    expect(
      tester.widget<MaterialApp>(find.byType(MaterialApp)).title,
      branding.name,
    );
    expect(
      (tester.widget<Image>(find.byType(Image)).image as AssetImage).assetName,
      branding.logoAsset,
    );

    await tester.pumpWidget(const SizedBox.shrink());
    final loading = FakeWebViewAdapter()
      ..hasDocument = false
      ..loading = true;
    await tester.pumpWidget(
      GoalHintApp(
        configuration: configuration,
        branding: branding,
        webViewAdapter: loading,
      ),
    );
    await tester.pump();
    expect(find.text(branding.name), findsOneWidget);
    expect(find.textContaining('Goal Hint'), findsNothing);
  });
}
