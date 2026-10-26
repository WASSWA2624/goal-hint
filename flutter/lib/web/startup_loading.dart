import 'package:flutter/material.dart';

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
              'assets/branding/goal-hint-mark.png',
              width: 96,
              height: 96,
              excludeFromSemantics: true,
            ),
            const SizedBox(height: 20),
            const Text(
              'Goal Hint',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: Color(0xFF061747),
                fontSize: 28,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 28),
            if (!MediaQuery.disableAnimationsOf(context)) ...[
              const SizedBox(
                width: 28,
                height: 28,
                child: CircularProgressIndicator(
                  color: Color(0xFF00A9EE),
                  strokeWidth: 2.5,
                  semanticsLabel: 'Loading Goal Hint',
                ),
              ),
              const SizedBox(height: 16),
            ],
            const Text('Loading…', style: TextStyle(color: Color(0xFF061747))),
          ],
        ),
      ),
    ),
  );
}
