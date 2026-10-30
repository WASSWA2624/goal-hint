import 'package:flutter/material.dart';
import 'web_appearance.dart';

class NativeThemeScope extends InheritedWidget {
  const NativeThemeScope({
    super.key,
    required this.preference,
    required this.onChanged,
    this.pendingPreference,
    required super.child,
  });
  final WebThemePreference preference;
  final ValueChanged<WebThemePreference> onChanged;
  final WebThemePreference? pendingPreference;
  static NativeThemeScope? of(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<NativeThemeScope>();
  @override
  bool updateShouldNotify(NativeThemeScope oldWidget) =>
      preference != oldWidget.preference ||
      onChanged != oldWidget.onChanged ||
      pendingPreference != oldWidget.pendingPreference;
}

class NativeThemePicker extends StatelessWidget {
  const NativeThemePicker({super.key});
  @override
  Widget build(BuildContext context) {
    final settings = NativeThemeScope.of(context);
    if (settings == null) return const SizedBox.shrink();
    return PopupMenuButton<WebThemePreference>(
      tooltip: 'Appearance',
      icon: Icon(
        Theme.of(context).brightness == Brightness.dark
            ? Icons.light_mode_outlined
            : Icons.dark_mode_outlined,
      ),
      initialValue: settings.preference,
      shape: const RoundedRectangleBorder(),
      onSelected: settings.onChanged,
      itemBuilder: (_) => [
        for (final mode in WebThemePreference.values)
          CheckedPopupMenuItem(
            value: mode,
            checked: settings.preference == mode,
            child: Text(switch (mode) {
              WebThemePreference.light => 'Light',
              WebThemePreference.dark => 'Dark',
              WebThemePreference.system => 'System',
            }),
          ),
      ],
    );
  }
}
