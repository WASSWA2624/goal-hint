import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:goal_hint/app.dart';
import 'package:goal_hint/config/app_config.dart';
import 'package:goal_hint/config/app_branding.dart';
import 'package:goal_hint/web/native_appearance_store.dart';
import 'package:goal_hint/web/native_recovery_view.dart';
import 'package:goal_hint/web/web_appearance.dart';
import 'support/fake_web_view.dart';

void main() {
  final configuration = AppConfig.resolve(isDebugBuild: true, isAndroid: false);
  testWidgets(
    'saved Light overrides dark OS offline and dark artwork follows the selected mode',
    (tester) async {
      tester.platformDispatcher.platformBrightnessTestValue = Brightness.dark;
      addTearDown(tester.platformDispatcher.clearPlatformBrightnessTestValue);
      final browser = _ThemeBrowser()..error = 'offline';
      final store = _MemoryStore();
      await tester.pumpWidget(
        GoalHintApp(
          configuration: configuration,
          webViewAdapter: browser,
          appearanceStore: store,
          initialAppearance: const NativeAppearanceSnapshot(
            preference: WebThemePreference.light,
          ),
        ),
      );
      await tester.pumpAndSettle();
      BuildContext context() => tester.element(find.byType(NativeRecoveryView));
      expect(Theme.of(context()).brightness, Brightness.light);
      expect(
        (tester.widget<Image>(find.byType(Image)).image as AssetImage)
            .assetName,
        const AppBranding().logoAsset,
      );
      await tester.tap(find.byTooltip('Appearance'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Dark'));
      await tester.pumpAndSettle();
      expect(Theme.of(context()).brightness, Brightness.dark);
      expect(
        (tester.widget<Image>(find.byType(Image)).image as AssetImage)
            .assetName,
        const AppBranding().darkLogoAsset,
      );
      expect(browser.requested, contains(WebThemePreference.dark));
      expect(store.snapshot!.preference, WebThemePreference.dark);
      expect(store.snapshot!.pending, isTrue);
      expect(browser.reloads, 0);
      expect(browser.disposed, isFalse);
    },
  );

  testWidgets(
    'saved System follows the OS rather than a stale resolved scheme',
    (tester) async {
      tester.platformDispatcher.platformBrightnessTestValue = Brightness.light;
      addTearDown(tester.platformDispatcher.clearPlatformBrightnessTestValue);
      final browser = FakeWebViewAdapter()..error = 'offline';
      await tester.pumpWidget(
        GoalHintApp(
          configuration: configuration,
          webViewAdapter: browser,
          initialAppearance: const NativeAppearanceSnapshot(
            preference: WebThemePreference.system,
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(
        Theme.of(tester.element(find.byType(NativeRecoveryView))).brightness,
        Brightness.light,
      );
      tester.platformDispatcher.platformBrightnessTestValue = Brightness.dark;
      await tester.pumpAndSettle();
      expect(
        Theme.of(tester.element(find.byType(NativeRecoveryView))).brightness,
        Brightness.dark,
      );
    },
  );
}

class _MemoryStore extends NativeAppearanceStore {
  _MemoryStore() : super(File('unused'));
  NativeAppearanceSnapshot? snapshot;
  @override
  Future<void> save(NativeAppearanceSnapshot value) async {
    snapshot = value;
  }
}

class _ThemeBrowser extends FakeWebViewAdapter {
  final requested = <WebThemePreference>[];
  @override
  Future<bool> updateWebTheme(WebThemePreference value) async {
    requested.add(value);
    return false;
  }
}
