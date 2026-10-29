import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test(
    'Android registers only the canonical HTTPS shared-slip app-link prefix',
    () {
      final manifest = File(
        'android/app/src/main/AndroidManifest.xml',
      ).readAsStringSync();
      final filters = RegExp(
        r'<intent-filter\s+android:autoVerify="true">([\s\S]*?)</intent-filter>',
      ).allMatches(manifest).toList();
      expect(filters, hasLength(1));
      final filter = filters.single.group(1)!;
      expect(filter, contains('android.intent.action.VIEW'));
      expect(filter, contains('android.intent.category.BROWSABLE'));
      expect(filter, contains('android.intent.category.DEFAULT'));
      expect(filter, contains('android:scheme="https"'));
      expect(filter, contains('android:host="goalhint.com"'));
      expect(filter, contains('android:pathPrefix="/s/"'));
      expect(filter, isNot(contains('android:scheme="http"')));
    },
  );

  test(
    'iOS signs every Runner variant with the canonical associated-domain entitlement',
    () {
      final project = File(
        'ios/Runner.xcodeproj/project.pbxproj',
      ).readAsStringSync();
      expect(
        RegExp(
          r'CODE_SIGN_ENTITLEMENTS = Runner/Runner.entitlements;',
        ).allMatches(project),
        hasLength(3),
      );
      final entitlement = File(
        'ios/Runner/Runner.entitlements',
      ).readAsStringSync();
      expect(entitlement, contains('com.apple.developer.associated-domains'));
      expect(entitlement, contains('<string>applinks:goalhint.com</string>'));
      expect(entitlement, isNot(contains('applinks:*')));
      for (final file in ['Info.plist', 'Info-Debug.plist']) {
        final settings = File('ios/Runner/$file').readAsStringSync();
        expect(
          settings,
          matches(r'<key>FlutterDeepLinkingEnabled</key>\s*<true/>'),
        );
      }
    },
  );
}
