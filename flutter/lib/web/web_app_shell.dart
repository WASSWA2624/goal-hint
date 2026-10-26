import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';

import '../config/app_config.dart';
import 'navigation_policy.dart';
import 'startup_loading.dart';
import 'web_view_adapter.dart';
import 'web_view_factory.dart';

class WebAppShell extends StatefulWidget {
  const WebAppShell({super.key, required this.configuration, this.adapter});

  final AppConfig configuration;
  final WebViewAdapter? adapter;

  @override
  State<WebAppShell> createState() => _WebAppShellState();
}

class _WebAppShellState extends State<WebAppShell> with WidgetsBindingObserver {
  late final WebViewAdapter _browser;
  bool _initializing = true;
  String? _startupError;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _browser =
        widget.adapter ??
        createWebViewAdapter(
          configuration: widget.configuration,
          navigationPolicy: NavigationPolicy(widget.configuration.origin),
          openExternal: _openExternal,
        );
    // Paint native loading feedback before constructing the browser engine.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) unawaited(_start());
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
    if (state == AppLifecycleState.resumed && !_initializing) {
      unawaited(_browser.resume());
    } else if (state == AppLifecycleState.paused) {
      unawaited(_suspend());
    }
  }

  Future<void> _suspend() async {
    try {
      await _browser.suspend();
    } on Exception {
      // Background persistence must not replace the current web document.
      // Session validity and reauthentication remain owned by the server.
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
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
      return PopScope(
        canPop: !_browser.canGoBack,
        onPopInvokedWithResult: (didPop, _) {
          if (!didPop && _browser.canGoBack) unawaited(_browser.goBack());
        },
        child: CallbackShortcuts(
          bindings: {
            const SingleActivator(LogicalKeyboardKey.arrowLeft, alt: true): () {
              if (_browser.canGoBack) unawaited(_browser.goBack());
            },
            const SingleActivator(LogicalKeyboardKey.f5): () =>
                unawaited(_retry()),
          },
          child: Scaffold(
            backgroundColor: Colors.white,
            body: SafeArea(
              bottom: defaultTargetPlatform != TargetPlatform.android,
              child: Stack(
                fit: StackFit.expand,
                children: [
                  // Retain the native view/profile while loading or retrying.
                  ExcludeSemantics(
                    excluding: starting || error != null,
                    child: _browser.buildView(),
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
                      child: Center(
                        child: SingleChildScrollView(
                          padding: const EdgeInsets.all(24),
                          child: ConstrainedBox(
                            constraints: const BoxConstraints(maxWidth: 440),
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Text(
                                  'Unable to load Goal Hint',
                                  textAlign: TextAlign.center,
                                  style: Theme.of(
                                    context,
                                  ).textTheme.headlineSmall,
                                ),
                                const SizedBox(height: 12),
                                Text(error, textAlign: TextAlign.center),
                                const SizedBox(height: 16),
                                OutlinedButton(
                                  onPressed: _initializing
                                      ? null
                                      : () => unawaited(_retry()),
                                  style: OutlinedButton.styleFrom(
                                    shape: const RoundedRectangleBorder(),
                                  ),
                                  child: const Text('Retry'),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
        ),
      );
    },
  );
}
