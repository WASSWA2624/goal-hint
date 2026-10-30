import 'package:flutter/material.dart';
import '../config/app_branding.dart';

import 'native_appearance.dart';
import 'web_view_failure.dart';

/// Bundled recovery UI: available even when no web document has been cached.
class NativeRecoveryView extends StatelessWidget {
  const NativeRecoveryView({
    super.key,
    required this.failure,
    required this.onRetry,
    this.busy = false,
  });

  final WebViewFailure failure;
  final VoidCallback onRetry;
  final bool busy;

  @override
  Widget build(BuildContext context) => NativeErrorView(
    title: failure.title(AppBrandingScope.of(context).name),
    message: failure.message(AppBrandingScope.of(context).name),
    icon: switch (failure) {
      WebViewFailure.connection => Icons.wifi_off_outlined,
      WebViewFailure.timeout => Icons.hourglass_empty_rounded,
      WebViewFailure.unavailable => Icons.cloud_off_outlined,
      WebViewFailure.secureConnection => Icons.lock_outline,
      WebViewFailure.browser => Icons.open_in_browser,
    },
    guidance: Column(
      children: switch (failure) {
        WebViewFailure.connection || WebViewFailure.timeout => [
          const _RecoveryTip(
            icon: Icons.wifi_outlined,
            title: 'Check Wi-Fi or mobile data',
            message: 'Turn on a connection and make sure airplane mode is off.',
          ),
          const _RecoveryTip(
            icon: Icons.sim_card_outlined,
            title: 'Check your data balance',
            message:
                'Make sure you have an active data bundle or Wi-Fi access.',
          ),
          _RecoveryTip(
            icon: Icons.sync_alt,
            title: 'Try another network',
            message:
                'If other apps work, ${AppBrandingScope.of(context).name} may be temporarily unavailable. Try again shortly.',
          ),
        ],
        WebViewFailure.unavailable => const [
          _RecoveryTip(
            icon: Icons.schedule,
            title: 'Give us a moment',
            message:
                'The service couldn’t complete your request. Wait a little, then try again.',
          ),
          _RecoveryTip(
            icon: Icons.wifi_outlined,
            title: 'Check your connection too',
            message: 'Make sure other apps or websites can connect.',
          ),
        ],
        WebViewFailure.secureConnection => const [
          _RecoveryTip(
            icon: Icons.update,
            title: 'Check your date and time',
            message: 'Use your device’s automatic date and time settings.',
          ),
          _RecoveryTip(
            icon: Icons.wifi_outlined,
            title: 'Use a trusted network',
            message:
                'Try another connection. If the problem continues, try again later.',
          ),
        ],
        WebViewFailure.browser => [
          _RecoveryTip(
            icon: Icons.restart_alt,
            title: 'Restart the app',
            message:
                'Close ${AppBrandingScope.of(context).name}, open it again and retry.',
          ),
          const _RecoveryTip(
            icon: Icons.system_update_outlined,
            title: 'Check for updates',
            message:
                'Update the app and your device’s browser components if an update is available.',
          ),
        ],
      },
    ),
    action: SizedBox(
      width: double.infinity,
      child: FilledButton.icon(
        style: FilledButton.styleFrom(
          minimumSize: const Size(48, 50),
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
          shape: const RoundedRectangleBorder(),
        ),
        onPressed: busy ? null : onRetry,
        icon: busy && !MediaQuery.disableAnimationsOf(context)
            ? const SizedBox.square(
                dimension: 18,
                child: CircularProgressIndicator(strokeWidth: 2),
              )
            : const Icon(Icons.refresh, size: 20),
        label: Text(busy ? 'Reconnecting…' : 'Try again'),
      ),
    ),
  );
}

class _RecoveryTip extends StatelessWidget {
  const _RecoveryTip({
    required this.icon,
    required this.title,
    required this.message,
  });

  final IconData icon;
  final String title;
  final String message;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(top: 2),
            child: Icon(icon, size: 20, color: theme.colorScheme.primary),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  message,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                    height: 1.45,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
