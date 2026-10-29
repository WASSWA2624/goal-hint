import 'package:flutter/material.dart';

import 'config/app_config.dart';
import 'web/web_app_shell.dart';
import 'web/native_appearance.dart';
import 'web/web_appearance.dart';
import 'web/web_view_adapter.dart';
import 'web/shared_slip_link.dart';

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

class _GoalHintAppState extends State<GoalHintApp> with WidgetsBindingObserver {
  final _navigatorKey = GlobalKey<NavigatorState>();
  WebAppearance? _appearance;
  Uri? _sharedSlipUri;
  int _sharedSlipRequest = 0;

  @override
  void initState() {
    super.initState();
    final configuration = widget.configuration;
    if (configuration != null) {
      _sharedSlipUri = sharedSlipLink(
        WidgetsBinding.instance.platformDispatcher.defaultRouteName,
        configuration.origin,
      );
    }
    // Register before MaterialApp so a native link keeps the same browser and
    // session rather than creating a second Flutter route/WebView.
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  Future<bool> didPushRouteInformation(
    RouteInformation routeInformation,
  ) async {
    final configuration = widget.configuration;
    final target = configuration == null
        ? null
        : sharedSlipLink(routeInformation.uri.toString(), configuration.origin);
    if (target != null && mounted) {
      setState(() {
        _sharedSlipUri = target;
        _sharedSlipRequest++;
      });
    }
    // Unsupported external routes are ignored, never passed to a native router.
    return true;
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  void _appearanceChanged(WebAppearance? appearance) {
    if (mounted && _appearance != appearance) {
      setState(() => _appearance = appearance);
    }
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Goal Hint',
      navigatorKey: _navigatorKey,
      initialRoute: '/',
      // The engine's cold-link route overrides initialRoute. Resolve only the
      // root native page; the validated URL is loaded by its existing WebView.
      onGenerateInitialRoutes: (_) => Navigator.defaultGenerateInitialRoutes(
        _navigatorKey.currentState!,
        Navigator.defaultRouteName,
      ),
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
      routes: {
        Navigator.defaultRouteName: (_) => widget.configurationError == null
            ? WebAppShell(
                configuration: widget.configuration!,
                adapter: widget.webViewAdapter,
                onAppearanceChanged: _appearanceChanged,
                sharedSlipUri: _sharedSlipUri,
                sharedSlipRequest: _sharedSlipRequest,
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
      },
    );
  }
}
