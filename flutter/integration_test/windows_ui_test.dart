import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:goal_hint/app.dart';
import 'package:goal_hint/config/app_config.dart';
import 'package:goal_hint/web/navigation_policy.dart';
import 'package:goal_hint/web/web_appearance.dart';
import 'package:goal_hint/web/windows_web_view.dart';
import 'package:integration_test/integration_test.dart';
import 'package:url_launcher/url_launcher.dart';

import 'support/native_page.dart';
import 'support/operator_control.dart';

const _phrase = 'Goal Hint keyboard 007';

/// Native input is supplied by the operator, never synthesized through DOM JS.
void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  testWidgets(
    'Windows native input, handlers and accessibility acceptance',
    (tester) async {
      expect(Platform.isWindows && kDebugMode, isTrue);
      final previousPointerPropagation =
          binding.shouldPropagateDevicePointerEvents;
      addTearDown(() {
        binding.shouldPropagateDevicePointerEvents = previousPointerPropagation;
      });
      final configuration = AppConfig.fromBuildEnvironment(isAndroid: false);
      expect(configuration.environment, AppEnvironment.development);
      expect(configuration.origin.scheme, 'http');
      expect(configuration.origin.host, 'windows-ui.localhost');
      expect(configuration.origin.port, isNot(3000));
      final control = OperatorControl(
        source: const String.fromEnvironment('WINDOWS_UI_CONTROL_FILE'),
        fixturePrefix: 'windows-ui-',
        marker: '.windows-ui-fixture-version',
      );
      final external = <Map<String, Object?>>[];
      final native = WindowsWebViewAdapter(
        configuration: configuration,
        navigationPolicy: NavigationPolicy(configuration.origin),
        openExternal: (uri) async {
          // The fixture may open only its own safe loopback alias in the OS browser.
          expect(uri.scheme, 'http');
          expect(uri.host, 'windows-handler.localhost');
          expect(uri.port, configuration.origin.port);
          expect(uri.path, '/native-handler');
          expect(uri.userInfo, isEmpty);
          expect(uri.hasQuery || uri.hasFragment, isFalse);
          final opened = await launchUrl(
            uri,
            mode: LaunchMode.externalApplication,
          );
          external.add({'uri': uri.toString(), 'opened': opened});
          return opened;
        },
      );
      final lifecycle = _Lifecycle();
      WidgetsBinding.instance.addObserver(lifecycle);
      final page = NativePage(tester, native);
      final evidence = <String, Object?>{
        'mode': 'Windows Debug synthetic native UI acceptance',
        'appPid': pid,
        'origin': configuration.origin.toString(),
      };
      String? originalThemePreference;
      var capturedThemePreference = false;
      Future<Map> observe() => _snapshot(page);
      Future<Map> gate(String stage) async =>
          control.checkpoint(tester, stage, await observe(), observe: observe);
      await tester.pumpWidget(
        GoalHintApp(configuration: configuration, webViewAdapter: native),
      );
      try {
        // This manual native check needs actual hardware input, which the test
        // binding otherwise intercepts for finder diagnostics by default.
        binding.shouldPropagateDevicePointerEvents = true;
        await page.untilAdapter(() => native.ready || native.error != null);
        await _home(page);
        expect(native.error, isNull);
        expect(
          await page.read('typeof window.flutter_inappwebview'),
          'undefined',
        );
        evidence['engine'] = await page.read('navigator.userAgent');
        originalThemePreference =
            await page.read("localStorage.getItem('goal-hint-theme')")
                as String?;
        capturedThemePreference = true;
        evidence['initialThemePreference'] = originalThemePreference;

        await gate('theme-light');
        evidence['themeLight'] = await _theme(page, native, 'light');
        await gate('theme-dark');
        evidence['themeDark'] = await _theme(page, native, 'dark');

        await gate('keyboard');
        final keyboard = await observe();
        expect(keyboard['draft'], _phrase);
        expect(keyboard['activeId'], 'internal-link');
        final input = keyboard['events'] as Map;
        expect(input['trustedInputEvents'], greaterThan(0));
        expect(
          (input['keys'] as List).any(
            (event) => event['key'] == 'Tab' && event['trusted'] == true,
          ),
          isTrue,
        );
        evidence['keyboard'] = keyboard;

        await gate('navigate');
        await page.until(
          'document.querySelector("[data-native-ui-detail]") !== null',
        );
        await page.untilAdapter(() => native.canGoBack);
        evidence['internalRoute'] = await page.read('location.pathname');
        await gate('back');
        await _home(page);
        await page.until(
          'document.querySelector("#acceptance-draft").value === "$_phrase"',
        );
        evidence['nativeBack'] = await observe();

        await gate('narrow');
        final narrow = await observe();
        expect((narrow['viewport'] as Map)['width'], lessThanOrEqualTo(700));
        expect(narrow['overflow'], isFalse);
        expect(narrow['draft'], _phrase);
        expect((narrow['events'] as Map)['resizeEvents'], greaterThan(0));
        evidence['narrow'] = narrow;
        await gate('wide');
        final wide = await observe();
        expect((wide['viewport'] as Map)['width'], greaterThanOrEqualTo(900));
        expect(wide['overflow'], isFalse);
        expect(wide['draft'], _phrase);
        evidence['wide'] = wide;

        final baselineDpr = (wide['viewport'] as Map)['dpr'] as num;
        await gate('zoom');
        final zoom = await observe();
        expect(
          (zoom['viewport'] as Map)['dpr'],
          greaterThanOrEqualTo(baselineDpr * 1.9),
        );
        expect(zoom['overflow'], isFalse);
        expect(zoom['draft'], _phrase);
        evidence['keyboardZoom'] = zoom;
        await gate('zoom-reset');
        final reset = await observe();
        expect((reset['viewport'] as Map)['dpr'], closeTo(baselineDpr, 0.05));

        final document = reset['timeOrigin'];
        await gate('external');
        await page.untilAdapter(() => external.isNotEmpty);
        expect(external.single['opened'], isTrue);
        expect(await page.read('location.origin'), configuration.origin.origin);
        final externalSnapshot = await observe();
        expect(externalSnapshot['timeOrigin'], document);
        expect(externalSnapshot['draft'], _phrase);
        expect(
          (externalSnapshot['events'] as Map)['externalClicks'],
          greaterThan(0),
        );
        evidence['externalHandler'] = external;

        await gate('file');
        final file = (await observe())['events'] as Map;
        expect((file['file'] as Map)['name'], 'windows-ui-selection.txt');
        expect((file['file'] as Map)['size'], greaterThan(0));
        expect((file['file'] as Map)['trusted'], isTrue);
        evidence['fileSelection'] = file['file'];

        final beforeLifecycle = await observe();
        final domCount =
            ((beforeLifecycle['events'] as Map)['visibility'] as List).length;
        final lifecycleCount = lifecycle.states.length;
        await gate('lifecycle');
        final afterLifecycle = await observe();
        expect(afterLifecycle['timeOrigin'], document);
        expect(afterLifecycle['draft'], _phrase);
        final newDomStates =
            ((afterLifecycle['events'] as Map)['visibility'] as List)
                .skip(domCount)
                .toList();
        final newNativeStates = lifecycle.states.skip(lifecycleCount).toList();
        expect(newDomStates, containsAll(['hidden', 'visible']));
        expect(newNativeStates, containsAll(['hidden', 'resumed']));
        evidence['lifecycle'] = {
          'native': newNativeStates,
          'document': newDomStates,
          'after': afterLifecycle,
        };

        final manual = await gate('accessibility');
        final accessibility = manual['accessibility'] ?? 'not-tested';
        final screenReader = manual['screenReader'] ?? 'not-tested';
        expect(['pass', 'fail', 'not-tested'], contains(accessibility));
        expect(['pass', 'fail', 'not-tested'], contains(screenReader));
        evidence['nativeAccessibility'] = accessibility;
        evidence['screenReader'] = screenReader;
        final note = manual['note'] as String? ?? '';
        evidence['accessibilityNote'] = note.length > 300
            ? note.substring(0, 300)
            : note;
        await control.write('evidence', evidence);
        await control.write('checkpoint', {
          'stage': 'complete',
          'appPid': pid,
          'nativeAccessibility': accessibility,
          'screenReader': screenReader,
        });
        // DOM names/ARIA and widget semantics cannot substitute for native exposure.
        expect(
          accessibility,
          'pass',
          reason:
              'Native web accessibility did not pass; inspect retained evidence.',
        );
      } finally {
        binding.shouldPropagateDevicePointerEvents = previousPointerPropagation;
        WidgetsBinding.instance.removeObserver(lifecycle);
        var preferenceRestored = !capturedThemePreference;
        try {
          if (capturedThemePreference) {
            preferenceRestored =
                await page.read('''
              (() => {
                if (location.origin !== ${jsonEncode(configuration.origin.origin)} ||
                    !document.querySelector('[data-windows-ui-fixture], [data-native-ui-detail]')) return false;
                const key = 'goal-hint-theme';
                const previous = ${jsonEncode(originalThemePreference)};
                if (previous === null) localStorage.removeItem(key);
                else localStorage.setItem(key, previous);
                // Use the shared preference's existing storage listener to drop
                // its in-memory override without replacing the active document.
                window.dispatchEvent(new StorageEvent('storage', { key }));
                sessionStorage.removeItem('goal-hint-native-ui-acceptance-draft');
                return localStorage.getItem(key) === previous;
              })()
            ''') ==
                true;
          }
        } catch (_) {
          // Teardown must not navigate or replace a failed document.
        }
        evidence['themePreferenceRestored'] = preferenceRestored;
        // Preserve earlier native observations even when a later assertion fails.
        await control.write('evidence', evidence);
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.pump();
        expect(
          preferenceRestored,
          isTrue,
          reason:
              'Restore the owned fixture theme preference before closing acceptance.',
        );
      }
    },
    timeout: const Timeout(Duration(minutes: 45)),
  );
}

Future<void> _home(NativePage page) async {
  await page.until(
    'document.querySelector("[data-windows-ui-fixture]") !== null && document.documentElement.dataset.windowsUiFixtureReady === "true"',
  );
  await page.documentReady();
}

Future<Map> _snapshot(NativePage page) async {
  final document =
      await page.read('''
  ({
    path: location.pathname,
    timeOrigin: performance.timeOrigin,
    draft: document.querySelector('#acceptance-draft')?.value ?? null,
    activeId: document.activeElement?.id ?? null,
    viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
    overflow: document.documentElement.scrollWidth > innerWidth + 1,
    theme: {
      scheme: getComputedStyle(document.documentElement).colorScheme,
      stored: localStorage.getItem('goal-hint-theme'),
      appearance: (() => { try { return JSON.parse(document.querySelector('meta[name="goal-hint-appearance"]')?.content ?? 'null'); } catch { return null; } })()
    },
    events: window.__goalHintNativeUi ?? null
  })
''')
          as Map;
  return {...document, 'nativeAppearance': _palette(page.adapter.appearance)};
}

Future<Map> _theme(
  NativePage page,
  WindowsWebViewAdapter native,
  String mode,
) async {
  await page.until('''
    getComputedStyle(document.documentElement).colorScheme === ${jsonEncode(mode)} &&
    localStorage.getItem('goal-hint-theme') === ${jsonEncode(mode)}
  ''');
  final projection = await page.read('''
    JSON.parse(document.querySelector('meta[name="goal-hint-appearance"]').content)
  ''');
  final expected = WebAppearance.parse(projection);
  expect(expected, isNotNull);
  expect(expected!.brightness.name, mode);
  await page.untilAdapter(() => native.appearance == expected);
  final snapshot = await _snapshot(page);
  expect(snapshot['nativeAppearance'], _palette(expected));
  return snapshot;
}

Map<String, Object?>? _palette(WebAppearance? value) {
  if (value == null) return null;
  String hex(Color color) =>
      '#${(color.toARGB32() & 0xFFFFFF).toRadixString(16).padLeft(6, '0')}';
  return {
    'version': 1,
    'scheme': value.brightness.name,
    'background': hex(value.background),
    'surface': hex(value.surface),
    'foreground': hex(value.foreground),
    'accent': hex(value.accent),
    'chrome': hex(value.chrome),
  };
}

class _Lifecycle extends WidgetsBindingObserver {
  final states = <String>[];
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    states.add(state.name);
  }
}
