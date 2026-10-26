import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';

import 'app.dart';
import 'config/app_config.dart';

void main() {
  try {
    runApp(
      GoalHintApp(
        configuration: AppConfig.fromBuildEnvironment(
          isAndroid: defaultTargetPlatform == TargetPlatform.android,
        ),
      ),
    );
  } on AppConfigException catch (error) {
    runApp(GoalHintApp.configurationError(error.message));
  }
}
