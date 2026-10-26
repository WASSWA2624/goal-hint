import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:goal_hint/app.dart';

void main() {
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

        await tester.pumpWidget(const GoalHintApp());
        await tester.pumpAndSettle();

        expect(find.text('Goal Hint'), findsOneWidget);
        expect(tester.takeException(), isNull);
      });
    }
  }
}
