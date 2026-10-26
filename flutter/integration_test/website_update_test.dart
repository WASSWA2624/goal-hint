import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:goal_hint/app.dart';
import 'package:goal_hint/config/app_config.dart';
import 'package:goal_hint/web/navigation_policy.dart';
import 'package:goal_hint/web/windows_web_view.dart';
import 'package:integration_test/integration_test.dart';
import 'package:path/path.dart' as path;

import 'support/native_page.dart';

/// Two independent web builds in one unchanged Debug host; never production QA.
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  testWidgets(
    'website deploy changes without rebuilding the native shell',
    (tester) async {
      expect(Platform.isWindows && kDebugMode, isTrue);
      final configuration = AppConfig.fromBuildEnvironment(isAndroid: false);
      expect(configuration.environment, AppEnvironment.development);
      expect(['localhost', '127.0.0.1'], contains(configuration.origin.host));
      expect(configuration.origin.port, isNot(3000));
      final control = _DeploymentControl();
      final native = WindowsWebViewAdapter(
        configuration: configuration,
        navigationPolicy: NavigationPolicy(configuration.origin),
        openExternal: (_) async => false,
      );
      final page = NativePage(tester, native);
      final before = await _nativeHashes();
      final appPid = pid;
      await tester.pumpWidget(
        GoalHintApp(configuration: configuration, webViewAdapter: native),
      );
      try {
        await page.untilAdapter(() => native.ready || native.error != null);
        final generationA = await _deployment(page, 'A');
        expect(native.error, isNull);
        await control.checkpoint(tester, 'swap-to-b', {
          'generationA': generationA,
          'nativeFiles': before,
          'engine': await page.read('navigator.userAgent'),
        });
        expect(pid, appPid);
        // The operator has replaced only the owned web server at the same origin.
        expect(await _nativeHashes(), before);
        await native.reload();
        await page.until(
          'performance.timeOrigin !== ${jsonEncode(generationA['timeOrigin'])}',
        );
        final generationB = await _deployment(page, 'B');
        expect(generationB['buildId'], isNot(generationA['buildId']));
        expect(generationB['origin'], generationA['origin']);
        expect(native.error, isNull);
        final after = await _nativeHashes();
        expect(after, before);
        expect(pid, appPid);
        final evidence = {
          'generationA': generationA,
          'generationB': generationB,
          'nativeFilesBefore': before,
          'nativeFilesAfter': after,
          'nativePidBefore': appPid,
          'nativePidAfter': pid,
          'sameNativeProcess': true,
          'mode': 'Debug synthetic loopback acceptance',
        };
        await control.write('evidence', evidence);
        await control.checkpoint(tester, 'generation-b', evidence);
        await control.write('checkpoint', {'stage': 'complete', 'appPid': pid});
      } finally {
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.pump();
      }
    },
    timeout: const Timeout(Duration(minutes: 16)),
  );
}

Future<Map> _deployment(NativePage page, String generation) async {
  await page.until(
    'document.querySelector("[data-release-fixture]")?.dataset.releaseGeneration === ${jsonEncode(generation)} && '
    'document.documentElement.dataset.releaseFixtureReady === "true"',
  );
  await page.documentReady();
  expect(await page.read('typeof window.flutter_inappwebview'), 'undefined');
  final metadata =
      await page.readAsync('''
    fetch('/release-metadata.json', { cache: 'no-store', credentials: 'omit' })
      .then(response => { if (!response.ok) throw new Error('Metadata unavailable'); return response.json(); })
  ''')
          as Map;
  expect(metadata['schemaVersion'], 1);
  expect(metadata['generation'], generation);
  expect(metadata['buildId'], matches(RegExp(r'^[A-Za-z0-9_-]{1,200}$')));
  return {
    ...metadata,
    'origin': await page.read('location.origin'),
    'timeOrigin': await page.read('performance.timeOrigin'),
    'heading': await page.read('document.querySelector("h1")?.textContent'),
  };
}

/// SHA256 of the installed test host, native plugins and complete Flutter data.
/// Debug uses kernel_blob.bin; app.so's absence is recorded rather than invented.
Future<Map<String, String>> _nativeHashes() async {
  final executable = File(
    Platform.resolvedExecutable,
  ).resolveSymbolicLinksSync();
  final bundle = File(executable).parent;
  final files = await bundle
      .list(recursive: true, followLinks: false)
      .where((entry) => entry is File)
      .cast<File>()
      .where((file) {
        final relative = path.relative(file.path, from: bundle.path);
        return relative.toLowerCase().endsWith('.exe') ||
            relative.toLowerCase().endsWith('.dll') ||
            path.split(relative).first == 'data';
      })
      .toList();
  files.sort((a, b) => a.path.compareTo(b.path));
  expect(files.any((file) => file.path == executable), isTrue);
  final hashes = <String, String>{};
  for (final file in files) {
    final result = await Process.run('certutil.exe', [
      '-hashfile',
      file.path,
      'SHA256',
    ]);
    expect(result.exitCode, 0, reason: 'Native bundle hash failed.');
    final digest = (result.stdout as String)
        .split(RegExp(r'[\r\n]+'))
        .map((line) => line.replaceAll(RegExp(r'\s'), ''))
        .where((line) => RegExp(r'^[a-fA-F0-9]{64}$').hasMatch(line))
        .single;
    hashes[path.relative(file.path, from: bundle.path).replaceAll('\\', '/')] =
        digest.toLowerCase();
  }
  hashes.putIfAbsent('data/app.so', () => 'absent in Debug');
  expect(hashes['data/flutter_assets/kernel_blob.bin'], isNotNull);
  return hashes;
}

/// Bounded file-only operator gates, outside the web document and native app.
class _DeploymentControl {
  _DeploymentControl() : file = _ownedFile();
  final File file;

  static File _ownedFile() {
    const source = String.fromEnvironment('WEBSITE_UPDATE_CONTROL_FILE');
    if (FileSystemEntity.typeSync(source, followLinks: false) !=
        FileSystemEntityType.file) {
      throw ArgumentError(
        'Create the owned website-update JSON control first.',
      );
    }
    final file = File(File(source).resolveSymbolicLinksSync());
    final segments = path.split(file.path);
    if (!segments.contains('.tmp') || !file.path.endsWith('.json')) {
      throw ArgumentError('Website-update controls require owned .tmp JSON.');
    }
    return file;
  }

  Future<Map> read() async {
    for (var attempt = 0; attempt < 3; attempt++) {
      try {
        final source = await file.readAsString();
        if (source.length > 4096) {
          throw StateError('Control exceeds its bound.');
        }
        return jsonDecode(source) as Map;
      } on FormatException {
        if (attempt == 2) rethrow;
        await Future<void>.delayed(const Duration(milliseconds: 20));
      }
    }
    throw StateError('Control unavailable.');
  }

  Future<void> write(String kind, Map value) async {
    final destination = File(
      file.path.replaceFirst(RegExp(r'\.json$'), '-$kind.json'),
    );
    final temporary = File('${destination.path}.next');
    if (await FileSystemEntity.type(temporary.path, followLinks: false) ==
        FileSystemEntityType.link) {
      throw StateError('Fixture output cannot follow a symbolic link.');
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
      if ((await read())['advance'] == stage) return;
      await tester.pump(const Duration(milliseconds: 200));
    }
    fail('Website-update operator checkpoint expired: $stage');
  }
}
