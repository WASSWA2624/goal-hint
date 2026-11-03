import 'package:flutter_test/flutter_test.dart';
import 'package:goal_hint/config/app_config.dart';
import 'package:goal_hint/web/app_user_agent.dart';

void main() {
  test(
    'native identity uses installed package metadata and deployment channel',
    () {
      expect(
        appUserAgentSuffix(
          platform: 'android',
          environment: AppEnvironment.development,
          version: '1.2.3',
          build: '7',
        ),
        'GoalHintNative/android/1.2.3/7/development',
      );
      expect(
        appUserAgentSuffix(
          platform: 'windows',
          environment: AppEnvironment.production,
          version: '2.0.0',
          build: '10',
        ),
        'GoalHintNative/windows/2.0.0/10/production',
      );
    },
  );
  test('unavailable version metadata still identifies the native host', () {
    expect(
      appUserAgentSuffix(
        platform: 'windows',
        environment: AppEnvironment.development,
        version: '',
        build: '',
      ),
      'GoalHintNative/windows/unknown/0/development',
    );
  });
}
