import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'web_appearance.dart';
import '../config/app_branding.dart';
import '../config/brand_tokens.dart';
import 'native_theme_scope.dart';

/// Only native feedback is styled here. The web owns its theme and preference.
ThemeData nativeTheme(Brightness brightness, {WebAppearance? appearance}) {
  final primary =
      appearance?.accent ??
      (brightness == Brightness.light
          ? BrandTokens.navy
          : BrandTokens.cyanOnDark);
  final scheme = ColorScheme.fromSeed(
    seedColor: appearance?.accent ?? BrandTokens.navy,
    brightness: brightness,
    primary: primary,
    onPrimary: primary.computeLuminance() > 0.179 ? Colors.black : Colors.white,
    surface:
        appearance?.surface ??
        (brightness == Brightness.light
            ? BrandTokens.white
            : Color.lerp(BrandTokens.navy, Colors.black, 0.3)),
    onSurface:
        appearance?.foreground ??
        (brightness == Brightness.light ? BrandTokens.navy : BrandTokens.paper),
  );
  return ThemeData(
    colorScheme: scheme,
    scaffoldBackgroundColor:
        appearance?.background ??
        (brightness == Brightness.light
            ? BrandTokens.paper
            : Color.lerp(BrandTokens.navy, Colors.black, 0.55)),
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
    this.recovery = false,
  });

  final Widget child;
  final WebAppearance? appearance;
  final bool launching;
  final bool recovery;

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
    final appearance = widget.appearance?.brightness == theme.brightness
        ? widget.appearance
        : null;
    final brightness = widget.launching ? Brightness.light : theme.brightness;
    final background = widget.launching
        ? Colors.white
        : appearance?.surface ?? theme.colorScheme.surface;
    final foreground = widget.launching
        ? BrandTokens.navy
        : appearance?.foreground ?? theme.colorScheme.onSurface;
    final chrome = widget.launching
        ? Colors.white
        : widget.recovery
        ? theme.scaffoldBackgroundColor
        : appearance?.chrome ?? theme.scaffoldBackgroundColor;
    final darkChrome = chrome.computeLuminance() < 0.179;
    final navigation = widget.recovery
        ? theme.scaffoldBackgroundColor
        : appearance?.chrome ?? theme.scaffoldBackgroundColor;
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
    this.icon = Icons.info_outline,
    this.guidance,
    this.action,
  });

  final String title;
  final String message;
  final IconData icon;
  final Widget? guidance;
  final Widget? action;

  @override
  Widget build(BuildContext context) => Center(
    child: SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 420),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Image.asset(
                  AppBrandingScope.of(
                    context,
                  ).logoFor(Theme.of(context).brightness),
                  width: 40,
                  height: 40,
                  excludeFromSemantics: true,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    AppBrandingScope.of(context).name,
                    style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                const NativeThemePicker(),
              ],
            ),
            const SizedBox(height: 36),
            Container(
              padding: const EdgeInsets.all(16),
              color: Theme.of(
                context,
              ).colorScheme.primary.withValues(alpha: 0.07),
              child: Icon(
                icon,
                size: 32,
                color: Theme.of(context).colorScheme.primary,
              ),
            ),
            const SizedBox(height: 20),
            Semantics(
              header: true,
              child: Text(
                title,
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.w700,
                  height: 1.2,
                ),
              ),
            ),
            const SizedBox(height: 12),
            Text(
              message,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                height: 1.5,
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
            ),
            if (action != null) ...[const SizedBox(height: 24), action!],
            if (guidance != null) ...[
              const SizedBox(height: 24),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 6,
                ),
                color: Theme.of(context).colorScheme.surface,
                child: guidance!,
              ),
            ],
          ],
        ),
      ),
    ),
  );
}
