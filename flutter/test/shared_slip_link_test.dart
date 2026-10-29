import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:goal_hint/app.dart';
import 'package:goal_hint/config/app_config.dart';
import 'package:goal_hint/web/shared_slip_link.dart';

import 'support/fake_web_view.dart';

const _first = '0123456789abcdef0123456789abcdef';
const _second = 'fedcba9876543210fedcba9876543210';

void main() {
  final production = AppConfig.resolve(isDebugBuild: false, isAndroid: true);

  test(
    'shared links accept the configured origin and exact public slip token',
    () {
      final target = Uri.parse('https://goalhint.com/s/$_first');
      expect(sharedSlipLink('/s/$_first', production.origin), target);
      expect(sharedSlipLink(target.toString(), production.origin), target);
      final development = Uri.parse('http://localhost:3000');
      expect(
        sharedSlipLink('http://localhost:3000/s/$_first', development),
        development.resolve('/s/$_first'),
      );
    },
  );

  test(
    'native links cannot change origin, inject routes, or include credentials',
    () {
      for (final address in [
        '/',
        '/en/account',
        '/s/not-a-token',
        '/s/$_first/extra',
        '/s/$_first?next=https://example.com',
        '/s/$_first#fragment',
        '/s/%30${_first.substring(1)}',
        '/s/${_first.toUpperCase()}',
        '//example.com/s/$_first',
        'https://example.com/s/$_first',
        'http://goalhint.com/s/$_first',
        'https://goalhint.com:444/s/$_first',
        'https://user@goalhint.com/s/$_first',
        'https://@goalhint.com/s/$_first',
        'https://goalhint.com:/s/$_first',
        'https://goalhint.com\\@example.com/s/$_first',
        'javascript:alert(1)',
        'https://goalhint.com/s/$_first\n',
      ]) {
        expect(
          sharedSlipLink(address, production.origin),
          isNull,
          reason: address,
        );
      }
    },
  );

  testWidgets('a cold native link opens its slip in the original browser', (
    tester,
  ) async {
    tester.platformDispatcher.defaultRouteNameTestValue = '/s/$_first';
    addTearDown(tester.platformDispatcher.clearDefaultRouteNameTestValue);
    final browser = _RecordingBrowser();
    await tester.pumpWidget(
      GoalHintApp(configuration: production, webViewAdapter: browser),
    );
    await tester.pumpAndSettle();
    expect(browser.loads, [Uri.parse('https://goalhint.com/s/$_first')]);
    expect(find.text('Embedded web application'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'warm and repeated links reuse the browser while invalid links are ignored',
    (tester) async {
      final browser = _RecordingBrowser();
      await tester.pumpWidget(
        GoalHintApp(configuration: production, webViewAdapter: browser),
      );
      await tester.pumpAndSettle();
      final target = 'https://goalhint.com/s/$_first';
      await tester.binding.handlePushRoute(target);
      await tester.pumpAndSettle();
      await tester.binding.handlePushRoute(target);
      await tester.pumpAndSettle();
      expect(browser.loads, [
        production.origin,
        Uri.parse(target),
        Uri.parse(target),
      ]);
      for (final route in ['https://example.com/s/$_first', '/en/account']) {
        await tester.binding.handlePushRoute(route);
        await tester.pumpAndSettle();
      }
      expect(browser.loads.length, 3);
      expect(browser.disposed, isFalse);
      expect(find.text('Embedded web application'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'a link arriving during browser initialization replaces the pending target',
    (tester) async {
      final browser = _RecordingBrowser(delayed: true);
      await tester.pumpWidget(
        GoalHintApp(configuration: production, webViewAdapter: browser),
      );
      await tester.pump();
      await tester.binding.handlePushRoute('/s/$_first');
      await tester.pump();
      await tester.binding.handlePushRoute('/s/$_second');
      await tester.pump();
      browser.initialized.complete();
      await tester.pumpAndSettle();
      expect(browser.loads, [Uri.parse('https://goalhint.com/s/$_second')]);
    },
  );

  testWidgets(
    'an unsupported cold link retains safe startup rather than a native route',
    (tester) async {
      tester.platformDispatcher.defaultRouteNameTestValue =
          'https://example.com/s/$_first';
      addTearDown(tester.platformDispatcher.clearDefaultRouteNameTestValue);
      final browser = _RecordingBrowser();
      await tester.pumpWidget(
        GoalHintApp(configuration: production, webViewAdapter: browser),
      );
      await tester.pumpAndSettle();
      expect(browser.loads, [production.origin]);
      expect(tester.takeException(), isNull);
    },
  );
}

class _RecordingBrowser extends FakeWebViewAdapter {
  _RecordingBrowser({this.delayed = false});

  final bool delayed;
  final initialized = Completer<void>();
  final loads = <Uri>[];

  @override
  Future<void> initialize() async {
    if (delayed) await initialized.future;
  }

  @override
  Future<void> load(Uri uri) async {
    loads.add(uri);
    await super.load(uri);
  }
}
