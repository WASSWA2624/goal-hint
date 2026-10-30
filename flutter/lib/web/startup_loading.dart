import 'package:flutter/material.dart';
import '../config/app_branding.dart';
import '../config/brand_tokens.dart';

/// Native launch feedback only; product appearance continues to come from web.
class StartupLoading extends StatelessWidget {
  const StartupLoading({super.key});

  @override
  Widget build(BuildContext context) => ColoredBox(
    color: Colors.white,
    child: Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Image.asset(
              AppBrandingScope.of(context).logoAsset,
              width: 96,
              height: 96,
              excludeFromSemantics: true,
            ),
            const SizedBox(height: 20),
            Text(
              AppBrandingScope.of(context).name,
              textAlign: TextAlign.center,
              style: const TextStyle(
                color: BrandTokens.navy,
                fontSize: 28,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 28),
            if (!MediaQuery.disableAnimationsOf(context)) ...[
              SizedBox(
                width: 28,
                height: 28,
                child: CircularProgressIndicator(
                  color: BrandTokens.cyan,
                  strokeWidth: 2.5,
                  semanticsLabel:
                      'Loading ${AppBrandingScope.of(context).name}',
                ),
              ),
              const SizedBox(height: 16),
            ],
            const Text('Loading…', style: TextStyle(color: BrandTokens.navy)),
          ],
        ),
      ),
    ),
  );
}
