import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

String _read(String path) =>
    File(path).readAsStringSync().replaceAll('\r\n', '\n');

String _compactXml(String value) =>
    value.replaceAll(RegExp(r'>\s+<'), '><').trim();

Map<String, String> _runnerInfoPlists(String project) {
  final configurations = RegExp(
    r'/\* (Debug|Profile|Release) \*/ = \{([\s\S]*?)\n\t\t\};',
  ).allMatches(project);
  final result = <String, String>{};
  for (final configuration in configurations) {
    final setting = RegExp(
      r'\bINFOPLIST_FILE\s*=\s*([^;]+);',
    ).firstMatch(configuration.group(2)!);
    if (setting == null) continue;
    final name = configuration.group(1)!;
    expect(
      result,
      isNot(contains(name)),
      reason: 'Duplicate Runner $name plist',
    );
    result[name] = setting.group(1)!.trim().replaceAll('"', '');
  }
  return result;
}

const _localHosts = [
  '127.0.0.1',
  '::1',
  '10.0.0.0/8',
  '172.16.0.0/12',
  '192.168.0.0/16',
  '169.254.0.0/16',
  'fc00::/7',
  'fe80::/10',
];

void main() {
  for (final platform in const {'iOS': 'ios', 'macOS': 'macos'}.entries) {
    final name = platform.key, directory = platform.value;
    test('$name Profile and Release retain the standard transport policy', () {
      final shared = _read('$directory/Runner/Info.plist');
      expect(shared, isNot(contains('NSAppTransportSecurity')));
      expect(shared, isNot(contains('NSLocalNetworkUsageDescription')));
      expect(shared, isNot(contains('NSBonjourServices')));
      expect(
        _runnerInfoPlists(_read('$directory/Runner.xcodeproj/project.pbxproj')),
        {
          'Debug': 'Runner/Info-Debug.plist',
          'Profile': 'Runner/Info.plist',
          'Release': 'Runner/Info.plist',
        },
      );
    });

    test('$name Debug preserves every shared bundle property', () {
      final shared = _compactXml(_read('$directory/Runner/Info.plist'));
      final debug = _compactXml(_read('$directory/Runner/Info-Debug.plist'));
      const closing = '</dict></plist>';
      expect(shared, endsWith(closing));
      expect(debug, endsWith(closing));
      final sharedProperties = shared.substring(
        0,
        shared.length - closing.length,
      );
      expect(debug, startsWith(sharedProperties));
      final additions = debug.substring(
        sharedProperties.length,
        debug.length - closing.length,
      );
      final addedKeys = RegExp(
        r'<key>([^<]+)</key>',
      ).allMatches(additions).map((match) => match.group(1)!).toList();
      expect(
        addedKeys,
        unorderedEquals([
          'NSAppTransportSecurity',
          'NSAllowsLocalNetworking',
          'NSExceptionDomains',
          ..._localHosts,
          for (final _ in _localHosts) 'NSExceptionAllowsInsecureHTTPLoads',
          'NSLocalNetworkUsageDescription',
        ]),
      );
    });

    test('$name Debug allows HTTP only for local development resources', () {
      final debug = _compactXml(_read('$directory/Runner/Info-Debug.plist'));
      expect(debug, contains('<key>NSAllowsLocalNetworking</key><true/>'));
      for (final host in _localHosts) {
        expect(
          debug,
          contains(
            '<key>$host</key><dict>'
            '<key>NSExceptionAllowsInsecureHTTPLoads</key><true/></dict>',
          ),
          reason: host,
        );
      }
      expect(
        debug,
        matches(
          r'<key>NSLocalNetworkUsageDescription</key><string>[^<]+</string>',
        ),
      );
      for (final forbidden in [
        'NSAllowsArbitraryLoads',
        'NSAllowsArbitraryLoadsInWebContent',
        'NSAllowsArbitraryLoadsForMedia',
        'NSExceptionMinimumTLSVersion',
        'NSExceptionRequiresForwardSecrecy',
        'NSBonjourServices',
      ]) {
        expect(debug, isNot(contains(forbidden)), reason: forbidden);
      }
    });
  }

  test('Android declares internet access with debug-only cleartext', () {
    final main = _read('android/app/src/main/AndroidManifest.xml');
    final debug = _read('android/app/src/debug/AndroidManifest.xml');
    expect(
      main,
      matches(
        r'<uses-permission\b[^>]*android:name="android\.permission\.INTERNET"',
      ),
    );
    expect(debug, matches(r'android:usesCleartextTraffic\s*=\s*"true"'));
    for (final variant in ['main', 'profile', 'release']) {
      final manifest = File('android/app/src/$variant/AndroidManifest.xml');
      if (!manifest.existsSync()) continue;
      final contents = manifest.readAsStringSync();
      expect(
        contents,
        isNot(matches(r'android:usesCleartextTraffic\s*=\s*"true"')),
        reason: '$variant must not enable cleartext',
      );
      expect(
        contents,
        isNot(contains('android:networkSecurityConfig')),
        reason: '$variant must retain the default transport policy',
      );
    }
  });

  test('macOS grants outbound networking without release debug privileges', () {
    for (final variant in ['DebugProfile', 'Release']) {
      final entitlements = _compactXml(
        _read('macos/Runner/$variant.entitlements'),
      );
      expect(
        entitlements,
        contains('<key>com.apple.security.app-sandbox</key><true/>'),
        reason: variant,
      );
      expect(
        entitlements,
        contains('<key>com.apple.security.network.client</key><true/>'),
        reason: variant,
      );
    }
    final release = _read('macos/Runner/Release.entitlements');
    expect(release, isNot(contains('com.apple.security.network.server')));
    expect(release, isNot(contains('com.apple.security.cs.allow-jit')));
  });
}
