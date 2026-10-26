import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:goal_hint/app.dart';
import 'package:goal_hint/config/app_config.dart';
import 'package:goal_hint/web/native_appearance.dart';
import 'package:goal_hint/web/startup_loading.dart';
import 'package:goal_hint/web/web_appearance.dart';

import 'support/fake_web_view.dart';

const dark = WebAppearance(
  brightness: Brightness.dark,
  background: Color(0xFF06131F),
  surface: Color(0xFF0B2035),
  foreground: Color(0xFFEAF3FF),
  accent: Color(0xFF00B9F2),
  chrome: Color(0xFF061747),
);
const light = WebAppearance(
  brightness: Brightness.light,
  background: Color(0xFFEFF7FF),
  surface: Colors.white,
  foreground: Color(0xFF061747),
  accent: Color(0xFF0064FF),
  chrome: Color(0xFF00347C),
);

void main() {
  final configuration = AppConfig.resolve(isDebugBuild: true, isAndroid: false);

  testWidgets(
    'web appearance controls native fallback without a reload or preference',
    (tester) async {
      tester.platformDispatcher.platformBrightnessTestValue = Brightness.light;
      addTearDown(tester.platformDispatcher.clearPlatformBrightnessTestValue);
      final browser = _AppearanceBrowser(dark)
        ..error = 'The server is unavailable.';
      await tester.pumpWidget(
        GoalHintApp(configuration: configuration, webViewAdapter: browser),
      );
      await tester.pumpAndSettle();
      var context = tester.element(find.byType(NativeErrorView));
      expect(Theme.of(context).brightness, Brightness.dark);
      expect(Theme.of(context).scaffoldBackgroundColor, dark.background);
      expect(Theme.of(context).colorScheme.onSurface, dark.foreground);

      browser.changeAppearance(light);
      await tester.pumpAndSettle();
      context = tester.element(find.byType(NativeErrorView));
      expect(Theme.of(context).brightness, Brightness.light);
      expect(Theme.of(context).scaffoldBackgroundColor, light.background);
      expect(browser.reloads, 0);
      expect(browser.loadedUri, configuration.origin);
    },
  );

  testWidgets(
    'dark OS and web appearance keep branded startup and bars white',
    (tester) async {
      tester.platformDispatcher.platformBrightnessTestValue = Brightness.dark;
      addTearDown(tester.platformDispatcher.clearPlatformBrightnessTestValue);
      final browser = _AppearanceBrowser(dark)
        ..hasDocument = false
        ..loading = true;
      await tester.pumpWidget(
        GoalHintApp(configuration: configuration, webViewAdapter: browser),
      );
      await tester.pump();
      await tester.pump();
      final box = tester.widget<ColoredBox>(
        find
            .descendant(
              of: find.byType(StartupLoading),
              matching: find.byType(ColoredBox),
            )
            .first,
      );
      expect(box.color, Colors.white);
      expect(find.text('Goal Hint'), findsOneWidget);
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      final overlay = tester
          .widget<AnnotatedRegion<SystemUiOverlayStyle>>(
            find.byType(AnnotatedRegion<SystemUiOverlayStyle>).first,
          )
          .value;
      expect(overlay.statusBarIconBrightness, Brightness.dark);
      expect(overlay.systemNavigationBarIconBrightness, Brightness.dark);
    },
  );

  testWidgets('reduced motion preserves readable startup feedback', (
    tester,
  ) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: MediaQuery(
          data: MediaQueryData(disableAnimations: true),
          child: StartupLoading(),
        ),
      ),
    );
    expect(find.text('Goal Hint'), findsOneWidget);
    expect(find.text('Loading…'), findsOneWidget);
    expect(find.byType(CircularProgressIndicator), findsNothing);
  });

  testWidgets(
    'navigation protection paints an inset without shrinking web content',
    (tester) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = const Size(400, 800);
      tester.view.viewPadding = const FakeViewPadding(bottom: 24);
      addTearDown(tester.view.resetDevicePixelRatio);
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetViewPadding);
      const content = ValueKey('full-web-content');
      await tester.pumpWidget(
        const MaterialApp(
          home: NativeChrome(
            appearance: light,
            child: Scaffold(body: SizedBox.expand(key: content)),
          ),
        ),
      );
      expect(tester.getSize(find.byKey(content)), const Size(400, 800));
      final protection = find.descendant(
        of: find.byType(NativeChrome),
        matching: find.byType(Positioned),
      );
      expect(tester.widget<Positioned>(protection).height, 24);
      expect(
        tester
            .widget<ColoredBox>(
              find.descendant(
                of: protection,
                matching: find.byType(ColoredBox),
              ),
            )
            .color,
        light.chrome,
      );
    },
    variant: TargetPlatformVariant.only(TargetPlatform.android),
  );

  testWidgets(
    'Windows decoration receives only public bounded colors and deduplicates',
    (tester) async {
      const channel = MethodChannel('com.goalhint.goal_hint/appearance');
      final calls = <MethodCall>[];
      tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(channel, (
        call,
      ) async {
        calls.add(call);
        return null;
      });
      addTearDown(
        () => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
          channel,
          null,
        ),
      );
      final browser = _AppearanceBrowser(dark);
      await tester.pumpWidget(
        GoalHintApp(configuration: configuration, webViewAdapter: browser),
      );
      await tester.pumpAndSettle();
      expect(calls, hasLength(2));
      expect(calls.first.arguments, {
        'dark': false,
        'background': 0xFFFFFF,
        'foreground': 0x061747,
      });
      expect(calls.last.method, 'setTitleBarTheme');
      expect(calls.last.arguments, {
        'dark': true,
        'background': 0x0B2035,
        'foreground': 0xEAF3FF,
      });
      browser.changeAppearance(dark);
      await tester.pumpAndSettle();
      expect(calls, hasLength(2));
      expect(browser.reloads, 0);
    },
    variant: TargetPlatformVariant.only(TargetPlatform.windows),
  );
}

class _AppearanceBrowser extends FakeWebViewAdapter {
  _AppearanceBrowser(this._appearance);
  WebAppearance _appearance;
  @override
  WebAppearance get appearance => _appearance;
  void changeAppearance(WebAppearance value) {
    _appearance = value;
    notifyListeners();
  }
}
