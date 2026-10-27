import 'package:flutter_test/flutter_test.dart';
import 'package:goal_hint/config/app_config.dart';

void main() {
  AppConfig development(String origin) => AppConfig.resolve(
    isDebugBuild: true,
    isAndroid: false,
    developmentOrigin: origin,
  );

  test('the normal debug entry point selects the local development origin', () {
    final config = AppConfig.fromBuildEnvironment(isAndroid: false);
    expect(config.environment, AppEnvironment.development);
    expect(config.origin.toString(), 'http://localhost:3000');
  });

  test('debug defaults use the host loopback or Android emulator alias', () {
    expect(
      AppConfig.resolve(isDebugBuild: true, isAndroid: false).origin.toString(),
      'http://localhost:3000',
    );
    expect(
      AppConfig.resolve(isDebugBuild: true, isAndroid: true).origin.toString(),
      'http://10.0.2.2:3000',
    );
  });

  test('non-debug builds default to the fixed production HTTPS origin', () {
    for (final android in [false, true]) {
      final config = AppConfig.resolve(isDebugBuild: false, isAndroid: android);
      expect(config.environment, AppEnvironment.production);
      expect(config.origin.toString(), 'https://goalhint.com');
    }
  });

  test(
    'debug can select production without inheriting a development address',
    () {
      final config = AppConfig.resolve(
        isDebugBuild: true,
        isAndroid: true,
        environmentName: 'production',
      );
      expect(config.origin.toString(), 'https://goalhint.com');
    },
  );

  test('release and profile cannot opt into development', () {
    expect(
      () => AppConfig.resolve(
        isDebugBuild: false,
        isAndroid: false,
        environmentName: 'development',
      ),
      throwsA(isA<AppConfigException>()),
    );
  });

  test('production rejects every supplied development override', () {
    for (final debug in [false, true]) {
      for (final override in [
        '',
        'http://localhost:3000',
        'https://dev.test',
      ]) {
        expect(
          () => AppConfig.resolve(
            isDebugBuild: debug,
            isAndroid: false,
            environmentName: 'production',
            developmentOrigin: override,
          ),
          throwsA(isA<AppConfigException>()),
        );
      }
    }
  });

  test('explicit blank and unknown environment values fail', () {
    for (final name in ['', ' ', 'Production', 'staging']) {
      expect(
        () => AppConfig.resolve(
          isDebugBuild: true,
          isAndroid: false,
          environmentName: name,
        ),
        throwsA(isA<AppConfigException>()),
      );
    }
  });

  test('development overrides accept and normalize real network origins', () {
    const valid = {
      'http://192.168.1.148:3000/': 'http://192.168.1.148:3000',
      'http://10.0.2.2:3000': 'http://10.0.2.2:3000',
      'http://127.0.0.1:3000': 'http://127.0.0.1:3000',
      'http://[::1]:3000/': 'http://[::1]:3000',
      'http://[fd00::1]:3000': 'http://[fd00::1]:3000',
      'https://DEV.example.test:443/': 'https://dev.example.test',
      'https://devbox.local': 'https://devbox.local',
    };
    for (final entry in valid.entries) {
      final config = development(entry.key);
      expect(config.environment, AppEnvironment.development);
      expect(config.origin.toString(), entry.value);
    }
  });

  test('invalid origins are rejected without exposing their values', () {
    const invalid = [
      '',
      ' ',
      ' localhost:3000',
      'http://localhost:3000 ',
      'localhost:3000',
      '//localhost:3000',
      '/en',
      'file:///en',
      'javascript:alert(1)',
      'ftp://localhost',
      'http:',
      'http://',
      'http:///en',
      'http://user:private-sentinel@localhost:3000',
      'http://@localhost:3000',
      'http://localhost:3000/en',
      'http://localhost:3000//',
      'http://localhost:3000?token=private-sentinel',
      'http://localhost:3000?',
      'http://localhost:3000#',
      'http://localhost:3000#private-sentinel',
      'http://localhost:',
      'http://localhost:0',
      'http://localhost:65536',
      'http://localhost:abc',
      'http://localhost:+80',
      'http://[::1]:',
      'http://[::1]:65536',
      'http://local host:3000',
      'http://local%20host:3000',
      'http://localhost\\@example.test',
      'http://localhost\n:3000',
      'http://localhost\u0000:3000',
    ];
    for (final value in invalid) {
      expect(
        () => development(value),
        throwsA(
          isA<AppConfigException>().having(
            (error) => error.toString(),
            'safe error message',
            isNot(contains('private-sentinel')),
          ),
        ),
        reason: 'Unexpectedly accepted an invalid origin',
      );
    }
  });
}
