import 'package:flutter/material.dart';

import 'config/app_config.dart';
import 'config/app_branding.dart';
import 'web/web_app_shell.dart';
import 'web/native_appearance.dart';
import 'web/web_appearance.dart';
import 'web/web_view_adapter.dart';
import 'web/shared_slip_link.dart';
import 'web/native_appearance_store.dart';
import 'web/native_theme_scope.dart';

/// Native startup boundary around the shared web application.
class GoalHintApp extends StatefulWidget {
  const GoalHintApp({
    super.key,
    required AppConfig this.configuration,
    this.webViewAdapter,
    this.branding = const AppBranding(),
    this.initialAppearance,
    this.appearanceStore,
  }) : configurationError = null;

  const GoalHintApp.configurationError(
    String message, {
    super.key,
    this.branding = const AppBranding(),
  }) : configuration = null,
       initialAppearance = null,
       appearanceStore = null,
       webViewAdapter = null,
       configurationError = message;

  final AppConfig? configuration;
  final String? configurationError;
  final AppBranding branding;
  final NativeAppearanceSnapshot? initialAppearance;
  final NativeAppearanceStore? appearanceStore;
  final WebViewAdapter? webViewAdapter;

  @override
  State<GoalHintApp> createState() => _GoalHintAppState();
}

class _GoalHintAppState extends State<GoalHintApp> with WidgetsBindingObserver {
  final _navigatorKey = GlobalKey<NavigatorState>();
  WebAppearance? _appearance;
  WebThemePreference? _preference;
  WebThemePreference? _pendingPreference;
  Uri? _sharedSlipUri;
  int _sharedSlipRequest = 0;

  @override
  void initState() {
    super.initState();
    _appearance = widget.initialAppearance?.appearance;
    _preference = widget.initialAppearance?.preference;
    if (widget.initialAppearance?.pending == true) {
      _pendingPreference = _preference;
    }
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
    if (mounted && appearance != null) {
      setState(() {
        _appearance = appearance;
        // A usable application's current preference is authoritative again.
        _pendingPreference = null;
        _preference = appearance.preference;
      });
      _saveAppearance();
    }
  }

  void _saveAppearance() {
    widget.appearanceStore?.save(
      NativeAppearanceSnapshot(
        appearance: _appearance,
        preference: _preference,
        pending: _pendingPreference != null,
      ),
    );
  }

  void _chooseTheme(WebThemePreference preference) {
    setState(() {
      _preference = preference;
      _pendingPreference = preference;
    });
    _saveAppearance();
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: widget.branding.name,
      builder: (context, child) => AppBrandingScope(
        branding: widget.branding,
        child: NativeThemeScope(
          preference: _preference ?? WebThemePreference.system,
          onChanged: _chooseTheme,
          pendingPreference: _pendingPreference,
          child: child!,
        ),
      ),
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
      themeMode: switch (_preference) {
        WebThemePreference.light => ThemeMode.light,
        WebThemePreference.dark => ThemeMode.dark,
        WebThemePreference.system => ThemeMode.system,
        null =>
          _appearance == null
              ? ThemeMode.system
              : _appearance!.brightness == Brightness.dark
              ? ThemeMode.dark
              : ThemeMode.light,
      },
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
                      title: 'Unable to start ${widget.branding.name}',
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
