import 'package:flutter/material.dart';

import 'config/app_config.dart';
import 'web/web_app_shell.dart';
import 'web/native_appearance.dart';
import 'web/web_appearance.dart';
import 'web/web_view_adapter.dart';

/// Native startup boundary around the shared web application.
class GoalHintApp extends StatefulWidget {
  const GoalHintApp({
    super.key,
    required AppConfig this.configuration,
    this.webViewAdapter,
  }) : configurationError = null;

  const GoalHintApp.configurationError(String message, {super.key})
    : configuration = null,
      webViewAdapter = null,
      configurationError = message;

  final AppConfig? configuration;
  final String? configurationError;
  final WebViewAdapter? webViewAdapter;

  @override
  State<GoalHintApp> createState() => _GoalHintAppState();
}

class _GoalHintAppState extends State<GoalHintApp> {
  WebAppearance? _appearance;

  void _appearanceChanged(WebAppearance? appearance) {
    if (mounted && _appearance != appearance) {
      setState(() => _appearance = appearance);
    }
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Goal Hint',
      debugShowCheckedModeBanner: false,
      theme: nativeTheme(
        Brightness.light,
        appearance: _appearance?.brightness == Brightness.light
            ? _appearance
            : null,
      ),
      darkTheme: nativeTheme(
        Brightness.dark,
        appearance: _appearance?.brightness == Brightness.dark
            ? _appearance
            : null,
      ),
      themeMode: _appearance == null
          ? ThemeMode.system
          : _appearance!.brightness == Brightness.dark
          ? ThemeMode.dark
          : ThemeMode.light,
      home: widget.configurationError == null
          ? WebAppShell(
              configuration: widget.configuration!,
              adapter: widget.webViewAdapter,
              onAppearanceChanged: _appearanceChanged,
            )
          : NativeChrome(
              child: Scaffold(
                body: SafeArea(
                  child: NativeErrorView(
                    title: 'Unable to start Goal Hint',
                    message: widget.configurationError!,
                    action: const Text(
                      'Contact the app provider for a corrected build.',
                      textAlign: TextAlign.center,
                    ),
                  ),
                ),
              ),
            ),
    );
  }
}
