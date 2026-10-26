import 'package:flutter/material.dart';

import 'config/app_config.dart';
import 'web/web_app_shell.dart';
import 'web/web_view_adapter.dart';

const _navy = Color(0xFF061747);
const _paper = Color(0xFFEFF7FF);

/// Native startup boundary around the shared web application.
class GoalHintApp extends StatelessWidget {
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
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Goal Hint',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: _navy),
        scaffoldBackgroundColor: _paper,
      ),
      home: configurationError == null
          ? WebAppShell(configuration: configuration!, adapter: webViewAdapter)
          : Scaffold(
              body: SafeArea(
                child: Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: SingleChildScrollView(
                      child: ConstrainedBox(
                        constraints: const BoxConstraints(maxWidth: 440),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Text(
                              'Unable to start Goal Hint',
                              textAlign: TextAlign.center,
                              style: TextStyle(
                                color: _navy,
                                fontSize: 24,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            const SizedBox(height: 12),
                            Text(
                              configurationError!,
                              textAlign: TextAlign.center,
                            ),
                            const SizedBox(height: 12),
                            const Text(
                              'Contact the app provider for a corrected build.',
                              textAlign: TextAlign.center,
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
    );
  }
}
