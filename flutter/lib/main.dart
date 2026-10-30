import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';

import 'app.dart';
import 'config/app_config.dart';
import 'web/native_appearance_store.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  try {
    final configuration = AppConfig.fromBuildEnvironment(
      isAndroid: defaultTargetPlatform == TargetPlatform.android,
    );
    NativeAppearanceStore? store;
    NativeAppearanceSnapshot? cached;
    try {
      store = await NativeAppearanceStore.forOrigin(configuration.origin);
      cached = await store.read();
    } catch (_) {
      /* A missing appearance cache does not prevent startup. */
    }
    runApp(
      GoalHintApp(
        configuration: configuration,
        initialAppearance: cached,
        appearanceStore: store,
      ),
    );
  } on AppConfigException catch (error) {
    runApp(GoalHintApp.configurationError(error.message));
  }
}
