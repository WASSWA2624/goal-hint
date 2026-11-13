import 'package:flutter/services.dart';
import 'package:flutter_inappwebview_windows/flutter_inappwebview_windows.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:goal_hint/config/app_config.dart';
import 'package:goal_hint/web/app_user_agent.dart';
import 'package:package_info_plus/package_info_plus.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

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

  test(
    'Windows reads the initialized WebView2 user agent and appends its marker',
    () async {
      const manager = MethodChannel(
        'com.pichillilorenzo/flutter_webview_environment',
      );
      const agent = 'Mozilla/5.0 WebView2';
      final messenger =
          TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
      MethodChannel? environmentChannel;
      addTearDown(() {
        messenger.setMockMethodCallHandler(manager, null);
        if (environmentChannel case final channel?) {
          messenger.setMockMethodCallHandler(channel, null);
        }
      });
      messenger.setMockMethodCallHandler(manager, (call) async {
        expect(call.method, 'create');
        final channel = environmentChannel = MethodChannel(
          '${manager.name}_${call.arguments['id']}',
        );
        messenger.setMockMethodCallHandler(channel, (call) async {
          expect(call.method, 'getUserAgent');
          return agent;
        });
        return true;
      });
      PackageInfo.setMockInitialValues(
        appName: 'Goal Hint',
        packageName: 'goal_hint',
        version: '1.2.3',
        buildNumber: '4',
        buildSignature: '',
      );
      final environment = await WindowsWebViewEnvironment.static().create();
      expect(await environment.getUserAgent(), agent);
      expect(
        await installedAppUserAgent(
          agent,
          'windows',
          AppEnvironment.production,
        ),
        '$agent GoalHintNative/windows/1.2.3/4/production',
      );
      messenger.setMockMethodCallHandler(environmentChannel!, null);
      expect(await environment.getUserAgent(), isNull);
    },
  );
}
