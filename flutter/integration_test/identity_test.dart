import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:goal_hint/app.dart';
import 'package:goal_hint/config/app_config.dart';
import 'package:goal_hint/web/navigation_policy.dart';
import 'package:goal_hint/web/startup_loading.dart';
import 'package:goal_hint/web/web_appearance.dart';
import 'package:goal_hint/web/web_view_adapter.dart';
import 'package:goal_hint/web/windows_web_view.dart';
import 'package:integration_test/integration_test.dart';

import 'support/native_page.dart';

/// Windows-only appearance acceptance. Host controls never become web APIs.
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  testWidgets(
    'shared identity and theme survive native restart',
    (tester) async {
      expect(Platform.isWindows, isTrue);
      final control = _IdentityControl();
      final phase = (await control.read())['phase'];
      expect(['first', 'reopen'], contains(phase));
      final configuration = AppConfig.fromBuildEnvironment(isAndroid: false);
      expect(configuration.environment, AppEnvironment.development);
      expect(['127.0.0.1', 'localhost'], contains(configuration.origin.host));
      expect(configuration.origin.port, isNot(3000));
      final native = _GatedBrowser(
        configuration: configuration,
        navigationPolicy: NavigationPolicy(configuration.origin),
        openExternal: (_) async => false,
      );
      final page = NativePage(tester, native);
      await tester.pumpWidget(
        GoalHintApp(configuration: configuration, webViewAdapter: native),
      );
      try {
        await tester.pump();
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
        await control.checkpoint(tester, 'startup', {'phase': phase});
        native.release.complete();
        await page.untilAdapter(() => native.ready || native.error != null);
        await _document(page);
        expect(native.error, isNull);
        expect(
          await page.read('typeof window.flutter_inappwebview'),
          'undefined',
        );
        debugPrint(
          'Identity engine: ${await page.read('navigator.userAgent')}',
        );

        if (phase == 'first') {
          // The marker and loopback checks above confine setup to this fixture.
          await page.execute(
            "localStorage.removeItem('goal-hint-theme'); true;",
          );
          await _reload(native, page);
          await _systemTheme(page);
          final systemBefore = await _snapshot(page);
          await control.checkpoint(tester, 'system', systemBefore);
          await _systemTheme(page);
          final systemAfter = await _snapshot(page);
          await control.write('system', {
            'before': systemBefore,
            'after': systemAfter,
          });
          // Use the actual shared website button and its real persistence code.
          await _toggle(page, 'light');
          await control.checkpoint(tester, 'light', await _snapshot(page));
          await _toggle(page, 'dark');
          await control.checkpoint(tester, 'dark', await _snapshot(page));
          await _reload(native, page);
          await _theme(page, 'dark', stored: 'dark');
          await control.write('state', {
            'origin': configuration.origin.toString(),
            'theme': 'dark',
            'systemBefore': systemBefore,
            'systemAfter': systemAfter,
          });
        } else {
          final saved = await control.saved();
          expect(saved['origin'], configuration.origin.toString());
          expect(saved['theme'], 'dark');
          await _theme(page, 'dark', stored: 'dark');
          await control.checkpoint(tester, 'reopen', await _snapshot(page));
          // Restore only the synthetic origin's theme key; normal app state stays.
          await page.execute(
            "localStorage.removeItem('goal-hint-theme'); true;",
          );
          await _reload(native, page);
          await _systemTheme(page);
        }
        await control.write('checkpoint', {
          'stage': 'complete',
          'phase': phase,
          'appPid': pid,
          'atMs': DateTime.now().millisecondsSinceEpoch,
        });
      } finally {
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.pump();
      }
    },
    timeout: const Timeout(Duration(minutes: 25)),
  );
}

Future<void> _document(NativePage page) async {
  await page.until(
    'document.querySelector("[data-identity-fixture]") !== null',
  );
  await page.documentReady();
  await page.until(
    'document.documentElement.dataset.identityFixtureReady === "true"',
  );
}

Future<void> _reload(WebViewAdapter browser, NativePage page) async {
  final origin = await page.read('performance.timeOrigin');
  await browser.reload();
  await page.until('performance.timeOrigin !== ${jsonEncode(origin)}');
  await _document(page);
}

Future<void> _systemTheme(NativePage page) async {
  final mode = await page.read(
    "matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'",
  );
  await _theme(page, mode as String, stored: null);
}

Future<void> _theme(
  NativePage page,
  String mode, {
  required String? stored,
}) async {
  await page.until(
    'getComputedStyle(document.documentElement).colorScheme === ${jsonEncode(mode)}',
  );
  await page.until('''
    (() => {
      const meta = document.querySelector('meta[name="goal-hint-appearance"]');
      return meta && JSON.parse(meta.content).scheme === ${jsonEncode(mode)};
    })()
  ''');
  final metadata =
      await page.read(
            'JSON.parse(document.querySelector(\'meta[name="goal-hint-appearance"]\').content)',
          )
          as Map;
  expect(metadata['version'], 1);
  final deadline = DateTime.now().add(const Duration(seconds: 15));
  while (DateTime.now().isBefore(deadline) &&
      !_matches(page.adapter.appearance, metadata)) {
    await page.tester.pump(const Duration(milliseconds: 200));
  }
  final appearance = page.adapter.appearance;
  expect(
    appearance,
    isNotNull,
    reason: 'Trusted web appearance must reach the shell.',
  );
  expect(appearance!.brightness.name, mode);
  for (final field in _colors(appearance).entries) {
    expect(
      field.value,
      _webColor(metadata[field.key] as String),
      reason: 'Native ${field.key} must match the resolved web theme.',
    );
  }
  expect(await page.read("localStorage.getItem('goal-hint-theme')"), stored);
}

int _webColor(String value) =>
    0xff000000 | int.parse(value.substring(1), radix: 16);
Map<String, int> _colors(WebAppearance value) => {
  'background': value.background.toARGB32(),
  'surface': value.surface.toARGB32(),
  'foreground': value.foreground.toARGB32(),
  'accent': value.accent.toARGB32(),
  'chrome': value.chrome.toARGB32(),
};
bool _matches(WebAppearance? value, Map metadata) =>
    value != null &&
    value.brightness.name == metadata['scheme'] &&
    _colors(value).entries.every(
      (field) => field.value == _webColor(metadata[field.key] as String),
    );

Future<void> _toggle(NativePage page, String mode) async {
  if (await page.read(
        'getComputedStyle(document.documentElement).colorScheme',
      ) !=
      mode) {
    await page.execute(
      'document.querySelector("[data-theme-toggle]").click(); true;',
    );
  } else {
    // Explicitly choose this mode even when it was the system fallback.
    await page.execute(
      'document.querySelector("[data-theme-toggle]").click(); true;',
    );
    await page.until(
      'getComputedStyle(document.documentElement).colorScheme !== ${jsonEncode(mode)}',
    );
    await page.execute(
      'document.querySelector("[data-theme-toggle]").click(); true;',
    );
  }
  await _theme(page, mode, stored: mode);
}

Future<Map> _snapshot(NativePage page) async => {
  ...await page.read('''({
  mode: getComputedStyle(document.documentElement).colorScheme,
  page: getComputedStyle(document.body).backgroundColor,
  text: getComputedStyle(document.body).color,
  stored: localStorage.getItem('goal-hint-theme'),
  systemDark: matchMedia('(prefers-color-scheme: dark)').matches
})''')
      as Map,
  'native': {
    'scheme': page.adapter.appearance?.brightness.name,
    if (page.adapter.appearance != null) ..._colors(page.adapter.appearance!),
  },
};

class _IdentityControl {
  _IdentityControl() : file = _ownedFile();
  final File file;
  static File _ownedFile() {
    const source = String.fromEnvironment('IDENTITY_CONTROL_FILE');
    if (FileSystemEntity.typeSync(source, followLinks: false) !=
        FileSystemEntityType.file) {
      throw ArgumentError('Create the owned identity JSON control file first.');
    }
    final result = File(File(source).resolveSymbolicLinksSync());
    final parts = result.path.replaceAll('\\', '/').split('/');
    if (!parts.any((part) => part == '.tmp' || part == '.dart_tool') ||
        !result.path.endsWith('.json')) {
      throw ArgumentError(
        'Identity controls must use owned ignored JSON output.',
      );
    }
    return result;
  }

  Future<Map> read() async {
    for (var attempt = 0; attempt < 3; attempt++) {
      try {
        final source = await file.readAsString();
        if (source.length > 4096) {
          throw StateError('Identity controls exceed their bound.');
        }
        return jsonDecode(source) as Map;
      } on FormatException {
        if (attempt == 2) rethrow;
        await Future<void>.delayed(const Duration(milliseconds: 20));
      }
    }
    throw StateError('Identity controls are unavailable.');
  }

  File output(String kind) =>
      File(file.path.replaceFirst(RegExp(r'\.json$'), '-$kind.json'));
  Future<Map> saved() async =>
      jsonDecode(await output('state').readAsString()) as Map;
  Future<void> write(String kind, Map value) async {
    final destination = output(kind);
    final temporary = File('${destination.path}.next');
    if (await FileSystemEntity.type(temporary.path, followLinks: false) ==
        FileSystemEntityType.link) {
      throw StateError('Identity output cannot follow a symbolic link.');
    }
    await temporary.writeAsString('${jsonEncode(value)}\n', flush: true);
    for (var attempt = 0; attempt < 5; attempt++) {
      try {
        await temporary.rename(destination.path);
        return;
      } on FileSystemException {
        if (attempt == 4) rethrow;
        await Future<void>.delayed(const Duration(milliseconds: 20));
      }
    }
  }

  Future<void> checkpoint(
    WidgetTester tester,
    String stage,
    Map details,
  ) async {
    await write('checkpoint', {
      'stage': stage,
      'appPid': pid,
      'atMs': DateTime.now().millisecondsSinceEpoch,
      ...details,
    });
    final deadline = DateTime.now().add(const Duration(minutes: 5));
    while (DateTime.now().isBefore(deadline)) {
      final command = await read();
      if (command['advance'] == stage || command['advance'] == 'all') return;
      await tester.pump(const Duration(milliseconds: 200));
    }
    fail('Identity operator checkpoint expired: $stage');
  }
}

/// Hold the real browser's initialization only for deterministic launch capture.
class _GatedBrowser extends WindowsWebViewAdapter {
  _GatedBrowser({
    required super.configuration,
    required super.navigationPolicy,
    required super.openExternal,
  });
  final release = Completer<void>();
  @override
  Future<void> initialize() async {
    await release.future;
    await super.initialize();
  }

  @override
  void dispose() {
    if (!release.isCompleted) release.complete();
    super.dispose();
  }
}
