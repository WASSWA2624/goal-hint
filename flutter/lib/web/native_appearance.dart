import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'web_appearance.dart';

const _navy = Color(0xFF061747);
const _paper = Color(0xFFEFF7FF);

/// Only native feedback is styled here. The web owns its theme and preference.
ThemeData nativeTheme(Brightness brightness, {WebAppearance? appearance}) {
  final scheme = ColorScheme.fromSeed(
    seedColor: appearance?.accent ?? _navy,
    brightness: brightness,
    primary: appearance?.accent,
    surface: appearance?.surface,
    onSurface: appearance?.foreground,
  );
  return ThemeData(
    colorScheme: scheme,
    scaffoldBackgroundColor:
        appearance?.background ??
        (brightness == Brightness.light ? _paper : scheme.surface),
    outlinedButtonTheme: const OutlinedButtonThemeData(
      style: ButtonStyle(
        shape: WidgetStatePropertyAll(RoundedRectangleBorder()),
      ),
    ),
  );
}

/// Presentation-only platform integration; no web-callable native channel.
class NativeChrome extends StatefulWidget {
  const NativeChrome({
    super.key,
    required this.child,
    this.appearance,
    this.launching = false,
  });

  final Widget child;
  final WebAppearance? appearance;
  final bool launching;

  @override
  State<NativeChrome> createState() => _NativeChromeState();
}

class _NativeChromeState extends State<NativeChrome> {
  static const _window = MethodChannel('com.goalhint.goal_hint/appearance');
  (bool, int, int)? _lastWindowStyle;

  void _updateWindow(bool dark, Color background, Color foreground) {
    if (defaultTargetPlatform != TargetPlatform.windows &&
        defaultTargetPlatform != TargetPlatform.macOS) {
      return;
    }
    final style = (
      dark,
      background.toARGB32() & 0xFFFFFF,
      foreground.toARGB32() & 0xFFFFFF,
    );
    if (_lastWindowStyle == style) return;
    _lastWindowStyle = style;
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      if (!mounted || _lastWindowStyle != style) return;
      try {
        await _window.invokeMethod<void>('setTitleBarTheme', {
          'dark': style.$1,
          'background': style.$2,
          'foreground': style.$3,
        });
      } on PlatformException {
        // Unsupported decoration never replaces a usable web document.
      } on MissingPluginException {
        // Widget tests and other runners need no desktop decoration channel.
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final appearance = widget.appearance;
    final brightness = widget.launching
        ? Brightness.light
        : appearance?.brightness ?? theme.brightness;
    final background = widget.launching
        ? Colors.white
        : appearance?.surface ?? theme.colorScheme.surface;
    final foreground = widget.launching
        ? _navy
        : appearance?.foreground ?? theme.colorScheme.onSurface;
    final chrome = widget.launching
        ? Colors.white
        : appearance?.chrome ?? theme.scaffoldBackgroundColor;
    final darkChrome = chrome.computeLuminance() < 0.179;
    final navigation = appearance?.chrome ?? _navy;
    final navigationIcons = widget.launching
        ? Brightness.dark
        : navigation.computeLuminance() < 0.179
        ? Brightness.light
        : Brightness.dark;
    final bottomInset = MediaQuery.viewPaddingOf(context).bottom;
    _updateWindow(brightness == Brightness.dark, background, foreground);
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle(
        // Draw beneath modern edge-to-edge bars instead of opting out.
        statusBarColor: Colors.transparent,
        statusBarIconBrightness: darkChrome
            ? Brightness.light
            : Brightness.dark,
        statusBarBrightness: darkChrome ? Brightness.dark : Brightness.light,
        // Older Android versions use the native bar color. At launch retain
        // its API-qualified resource (white with dark icons, or legacy black).
        systemNavigationBarColor: widget.launching ? null : navigation,
        systemNavigationBarDividerColor: widget.launching
            ? null
            : Colors.transparent,
        systemNavigationBarIconBrightness: navigationIcons,
        systemStatusBarContrastEnforced: false,
        systemNavigationBarContrastEnforced: false,
      ),
      child: defaultTargetPlatform == TargetPlatform.android && bottomInset > 0
          ? Stack(
              fit: StackFit.passthrough,
              children: [
                widget.child,
                // Paint behind edge-to-edge navigation controls without adding
                // layout padding or applying the web safe-area inset twice.
                Positioned(
                  left: 0,
                  right: 0,
                  bottom: 0,
                  height: bottomInset,
                  child: IgnorePointer(
                    child: ColoredBox(
                      color: widget.launching ? Colors.white : navigation,
                    ),
                  ),
                ),
              ],
            )
          : widget.child,
    );
  }
}

/// Reusable, accessible fallback for configuration and document failures.
class NativeErrorView extends StatelessWidget {
  const NativeErrorView({
    super.key,
    required this.title,
    required this.message,
    this.action,
  });

  final String title;
  final String message;
  final Widget? action;

  @override
  Widget build(BuildContext context) => Center(
    child: SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 440),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              title,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            const SizedBox(height: 12),
            Text(message, textAlign: TextAlign.center),
            if (action != null) ...[const SizedBox(height: 16), action!],
          ],
        ),
      ),
    ),
  );
}
