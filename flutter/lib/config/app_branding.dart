import 'package:flutter/widgets.dart';
import 'brand_tokens.dart';

/// Public native branding, shared by startup, recovery and accessibility labels.
/// The mark is bundled so it remains available without a network connection.
class AppBranding {
  const AppBranding({
    this.name = const String.fromEnvironment(
      'APP_DISPLAY_NAME',
      defaultValue: BrandTokens.name,
    ),
    this.logoAsset = 'assets/branding/goal-hint-mark.png',
  });

  final String name;
  final String logoAsset;
}

class AppBrandingScope extends InheritedWidget {
  const AppBrandingScope({
    super.key,
    required this.branding,
    required super.child,
  });

  final AppBranding branding;

  static AppBranding of(BuildContext context) =>
      context
          .dependOnInheritedWidgetOfExactType<AppBrandingScope>()
          ?.branding ??
      const AppBranding();

  @override
  bool updateShouldNotify(AppBrandingScope oldWidget) =>
      branding.name != oldWidget.branding.name ||
      branding.logoAsset != oldWidget.branding.logoAsset;
}
