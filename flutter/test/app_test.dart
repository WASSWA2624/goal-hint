import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:goal_hint/app.dart';
import 'package:goal_hint/config/app_config.dart';

void main() {
  testWidgets('invalid configuration renders a safe and scrollable error', (
    tester,
  ) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(320, 568);
    tester.platformDispatcher.textScaleFactorTestValue = 2;
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    late AppConfigException problem;
    try {
      AppConfig.resolve(
        isDebugBuild: true,
        isAndroid: false,
        developmentOrigin: 'http://private-sentinel@localhost:3000',
      );
      fail('Credential-bearing configuration must fail.');
    } on AppConfigException catch (error) {
      problem = error;
    }
    await tester.pumpWidget(GoalHintApp.configurationError(problem.message));
    await tester.pumpAndSettle();

    expect(find.text('Unable to start Goal Hint'), findsOneWidget);
    expect(find.textContaining('private-sentinel'), findsNothing);
    expect(find.byType(SingleChildScrollView), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  for (final size in [const Size(320, 568), const Size(1440, 900)]) {
    for (final textScale in [1.0, 2.0]) {
      testWidgets('startup fits $size with text scale $textScale', (
        tester,
      ) async {
        tester.view.devicePixelRatio = 1;
        tester.view.physicalSize = size;
        tester.platformDispatcher.textScaleFactorTestValue = textScale;
        addTearDown(tester.view.resetDevicePixelRatio);
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);

        await tester.pumpWidget(
          GoalHintApp(
            configuration: AppConfig.resolve(
              isDebugBuild: true,
              isAndroid: false,
            ),
          ),
        );
        await tester.pumpAndSettle();

        expect(find.text('Goal Hint'), findsOneWidget);
        expect(tester.takeException(), isNull);
      });
    }
  }
}
