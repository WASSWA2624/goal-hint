import 'dart:convert';
import 'dart:io';

import 'package:goal_hint/config/app_config.dart';

/// Resolves the same public build configuration used by the native entry point.
void main(List<String> arguments) {
  if (arguments.isNotEmpty &&
      (arguments.length != 1 || arguments.single != '--android')) {
    stderr.writeln('Usage: dart run tool/resolve_origin.dart [--android]');
    exitCode = 64;
    return;
  }
  try {
    final configuration = AppConfig.fromBuildEnvironment(
      isAndroid: arguments.contains('--android'),
    );
    stdout.writeln(
      jsonEncode({
        'environment': configuration.environment.name,
        'origin': configuration.origin.toString(),
      }),
    );
  } on AppConfigException catch (error) {
    stderr.writeln(error.message);
    exitCode = 64;
  }
}
