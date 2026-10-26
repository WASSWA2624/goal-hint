import 'package:flutter/material.dart';

const _navy = Color(0xFF061747);
const _paper = Color(0xFFEFF7FF);

/// Native startup boundary; the shared web experience is integrated in step 003.
class GoalHintApp extends StatelessWidget {
  const GoalHintApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Goal Hint',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: _navy),
        scaffoldBackgroundColor: _paper,
      ),
      home: Scaffold(
        body: SafeArea(
          child: Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Semantics(
                header: true,
                child: const Text(
                  'Goal Hint',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: _navy,
                    fontSize: 28,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
