import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';

import '../config/app_config.dart';
import 'navigation_policy.dart';
import 'native_appearance.dart';
import 'startup_loading.dart';
import 'web_appearance.dart';
import 'web_view_adapter.dart';
import 'web_view_factory.dart';

class WebAppShell extends StatefulWidget {
  const WebAppShell({
    super.key,
    required this.configuration,
    this.adapter,
    this.onAppearanceChanged,
  });

  final AppConfig configuration;
  final WebViewAdapter? adapter;
  final ValueChanged<WebAppearance?>? onAppearanceChanged;

  @override
  State<WebAppShell> createState() => _WebAppShellState();
}

class _WebAppShellState extends State<WebAppShell> with WidgetsBindingObserver {
  late final WebViewAdapter _browser;
  bool _initializing = true;
  bool _hidden = false;
  bool _browserHidden = false;
  Future<void> _lifecycle = Future<void>.value();
  String? _startupError;
  WebAppearance? _reportedAppearance;

  @override
  void initState() {
    super.initState();
    final lifecycle = WidgetsBinding.instance.lifecycleState;
    _hidden =
        lifecycle == AppLifecycleState.hidden ||
        lifecycle == AppLifecycleState.paused;
    WidgetsBinding.instance.addObserver(this);
    _browser =
        widget.adapter ??
        createWebViewAdapter(
          configuration: widget.configuration,
          navigationPolicy: NavigationPolicy(widget.configuration.origin),
          openExternal: _openExternal,
        );
    _browser.addListener(_reportAppearance);
    _reportAppearance();
    // Paint native loading feedback before constructing the browser engine.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) unawaited(_start());
    });
  }

  void _reportAppearance() {
    if (_reportedAppearance == _browser.appearance) return;
    _reportedAppearance = _browser.appearance;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) widget.onAppearanceChanged?.call(_browser.appearance);
    });
  }

  Future<bool> _openExternal(Uri uri) async {
    var opened = false;
    try {
      opened = await launchUrl(uri, mode: LaunchMode.externalApplication);
    } on Exception {
      // Keep the current document intact when no native handler is installed.
    }
    if (!opened && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Unable to open this link on this device.'),
        ),
      );
    }
    return opened;
  }

  Future<void> _start() async {
    try {
      await _browser.initialize();
      if (mounted) {
        setState(() => _initializing = false);
        await _browser.load(widget.configuration.origin);
        _syncVisibility();
      }
    } on Exception {
      if (mounted) {
        setState(() {
          _initializing = false;
          _startupError =
              'Unable to start the embedded browser on this device.';
        });
      }
    }
  }

  Future<void> _retry() async {
    if (_startupError != null || !_browser.ready) {
      setState(() {
        _startupError = null;
        _initializing = true;
      });
      await _start();
    } else {
      await _browser.reload();
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _hidden = false;
    } else if (state == AppLifecycleState.hidden ||
        state == AppLifecycleState.paused) {
      _hidden = true;
    } else {
      return;
    }
    _syncVisibility();
  }

  void _syncVisibility() {
    if (_initializing || _browserHidden == _hidden) return;
    final hidden = _hidden;
    _browserHidden = hidden;
    // Order native lifecycle commands so a quick restore follows suspension;
    // hidden → paused must suspend only once. Engine suspension is best effort.
    _lifecycle = _lifecycle.then((_) async {
      if (!mounted) return;
      try {
        if (hidden) {
          await _browser.suspend();
        } else {
          await _browser.resume();
        }
      } on Exception {
        // Native lifecycle races must preserve the current web document.
      }
    });
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _browser.removeListener(_reportAppearance);
    _browser.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: _browser,
    builder: (context, _) {
      final error = _startupError ?? _browser.error;
      final starting =
          (!_browser.hasDocument || _initializing) && error == null;
      return NativeChrome(
        launching: starting,
        appearance: _browser.appearance,
        child: PopScope(
          canPop: !_browser.canGoBack,
          onPopInvokedWithResult: (didPop, _) {
            if (!didPop && _browser.canGoBack) unawaited(_browser.goBack());
          },
          child: CallbackShortcuts(
            bindings: {
              const SingleActivator(
                LogicalKeyboardKey.arrowLeft,
                alt: true,
              ): () {
                if (_browser.canGoBack) unawaited(_browser.goBack());
              },
              const SingleActivator(LogicalKeyboardKey.f5): () =>
                  unawaited(_retry()),
            },
            child: Scaffold(
              backgroundColor: starting
                  ? Colors.white
                  : _browser.appearance?.chrome ??
                        Theme.of(context).scaffoldBackgroundColor,
              body: SafeArea(
                bottom: defaultTargetPlatform != TargetPlatform.android,
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    // Retain the native view/profile while loading or retrying.
                    ExcludeSemantics(
                      excluding: starting || error != null,
                      child: ColoredBox(
                        color: _browser.appearance?.background ?? Colors.white,
                        child: _browser.buildView(),
                      ),
                    ),
                    if (starting) const StartupLoading(),
                    if (!starting && _browser.loading && error == null)
                      const Align(
                        alignment: Alignment.topCenter,
                        child: LinearProgressIndicator(
                          semanticsLabel: 'Loading Goal Hint',
                        ),
                      ),
                    if (error != null)
                      ColoredBox(
                        color: Theme.of(context).scaffoldBackgroundColor,
                        child: NativeErrorView(
                          title: 'Unable to load Goal Hint',
                          message: error,
                          action: OutlinedButton(
                            onPressed: _initializing
                                ? null
                                : () => unawaited(_retry()),
                            child: const Text('Retry'),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ),
          ),
        ),
      );
    },
  );
}
