import 'package:package_info_plus/package_info_plus.dart';

import '../config/app_config.dart';

/// Public installed-package metadata only; the website owns download/update UI.
String appUserAgentSuffix({
  required String platform,
  required AppEnvironment environment,
  required String version,
  required String build,
}) {
  final valid =
      RegExp(r'^\d+\.\d+\.\d+$').hasMatch(version) &&
      (int.tryParse(build) ?? 0) > 0;
  return 'GoalHintNative/$platform/${valid ? version : 'unknown'}/${valid ? build : '0'}/${environment.name}';
}

Future<String> installedAppUserAgent(
  String browserAgent,
  String platform,
  AppEnvironment environment,
) async {
  var version = '', build = '';
  try {
    final info = await PackageInfo.fromPlatform();
    version = info.version;
    build = info.buildNumber;
  } on Exception {
    // Failed metadata reads still identify the host and suppress install offers.
  }
  return '$browserAgent ${appUserAgentSuffix(platform: platform, environment: environment, version: version, build: build)}';
}
