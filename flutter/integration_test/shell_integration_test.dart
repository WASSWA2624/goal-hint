import 'dart:convert';
import 'dart:io';
import 'dart:ui' show PointerDeviceKind;

import 'package:flutter_inappwebview_platform_interface/flutter_inappwebview_platform_interface.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:goal_hint/app.dart';
import 'package:goal_hint/config/app_config.dart';
import 'package:goal_hint/web/navigation_policy.dart';
import 'package:goal_hint/web/system_web_view.dart';
import 'package:goal_hint/web/web_app_shell.dart';
import 'package:goal_hint/web/web_view_factory.dart';
import 'package:goal_hint/web/windows_web_view.dart';
import 'package:integration_test/integration_test.dart';

import 'support/native_page.dart';

/// Run only against tool/serve_web_fixture.py, never a real account environment.
/// The first phase leaves a synthetic session; `reopen` checks it in a new process.
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets(
    'embedded Next.js navigation and synthetic account lifecycle',
    (tester) async {
      final configuration = AppConfig.fromBuildEnvironment(
        isAndroid: Platform.isAndroid,
      );
      expect(configuration.environment, AppEnvironment.development);
      final external = <Uri>[];
      final adapter = createWebViewAdapter(
        configuration: configuration,
        navigationPolicy: NavigationPolicy(configuration.origin),
        openExternal: (uri) async {
          external.add(uri);
          return true;
        },
      );
      final page = _Page(tester, adapter);
      await tester.pumpWidget(
        GoalHintApp(configuration: configuration, webViewAdapter: adapter),
      );
      const phase = String.fromEnvironment(
        'SHELL_CHECK_PHASE',
        defaultValue: 'first',
      );
      await page.untilAdapter(() => adapter.ready || adapter.error != null);
      await tester.pump();
      if (phase == 'tls_error') {
        expect(adapter.ready, isTrue);
        await page.untilAdapter(() => adapter.error != null);
        await tester.pump();
        expect(adapter.loading, isFalse);
        expect(find.text('Retry'), findsOneWidget);
        await tester.tap(find.text('Retry'));
        await tester.pump();
        await page.untilAdapter(
          () => adapter.error != null && !adapter.loading,
        );
        return;
      }
      if (phase == 'live') {
        // Read-only check against the real Next.js development application.
        // Never submit account forms or make account/financial mutations here.
        await page.until(
          'document.readyState === "complete" && document.body.innerText.includes("Goal Hint")',
        );
        expect(
          await page.read(
            'document.documentElement.scrollWidth <= innerWidth + 1',
          ),
          isTrue,
        );
        await page.execute(
          'document.documentElement.style.fontSize = "200%"; true',
        );
        await tester.pump(const Duration(milliseconds: 500));
        expect(
          await page.read(
            'document.documentElement.scrollWidth <= innerWidth + 1',
          ),
          isTrue,
        );
        await page.execute(
          'document.documentElement.style.fontSize = ""; true',
        );
        await adapter.load(
          configuration.origin.resolve('/en/account?view=login'),
        );
        await page.until(
          'document.querySelector("form[action\$=login]") !== null',
        );
        await page.tap('[data-phone-input]');
        await page.fill('[data-phone-input]', '700000101');
        expect(
          await page.read('document.querySelector("[data-phone-input]").value'),
          contains('700'),
        );
        await page.untilAdapter(() => adapter.canGoBack);
        await page.nativeBack();
        await page.until(
          '!location.pathname.endsWith("/account") && document.readyState === "complete" && document.body?.innerText.includes("Goal Hint")',
        );
        // Drain native focus changes while the test binding is still alive.
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.pump();
        return;
      }
      await page.until(
        'document.querySelector("[data-fixture-home]") !== null',
      );

      // Guard before any write: the synthetic fixture owns this marker and sends
      // no messages, writes no database, and uses no production account secrets.
      expect(
        await page.read('document.body.innerText'),
        contains('Synthetic signup verification completed at the home page.'),
      );

      if (Platform.isWindows) {
        expect(
          await page.read('typeof window.flutter_inappwebview'),
          'undefined',
        );
      }
      if (phase == 'reopen') {
        final session = await page.request('/api/account/session');
        expect(session['status'], 200);
        expect((session['body'] as Map)['phone'], '256700000101');
        await page.signOut();
        expect(
          (await page.request('/api/account/session'))['body'],
          containsPair('phone', null),
        );
        return;
      }
      expect(phase, 'first');
      await page.signOut();

      final route = configuration.origin.resolve(
        '/en/account?view=login&return=%2Fen%2Fmatches',
      );
      await adapter.load(route);
      await page.until(
        'document.querySelector("form[action\$=login]") !== null',
      );
      expect(
        await page.read('location.search'),
        '?view=login&return=%2Fen%2Fmatches',
      );
      await page.fill('[data-phone-input]', '700000101');
      await page.fill('input[name="password"]', 'Synthetic password');
      expect(
        await page.read('document.querySelector("input[name=password]").value'),
        'Synthetic password',
      );

      // Resume must preserve unfinished web input rather than reloading the page.
      await adapter.resume();
      expect(
        await page.read('document.querySelector("input[name=password]").value'),
        'Synthetic password',
      );
      await page.tap('a[href*="view=register"]');
      await page.until('location.search.includes("view=register")');
      await page.until(
        'document.querySelector("form[action\$=register]") !== null',
      );
      if (Platform.isAndroid || Platform.isWindows) {
        expect(
          await page.read('navigator.userActivation.hasBeenActive'),
          isTrue,
        );
      }
      await page.untilAdapter(() => adapter.canGoBack);
      debugPrint('Before fixture back: ${await page.publicLocation()}');
      await page.nativeBack();
      await tester.pump(const Duration(milliseconds: 500));
      debugPrint('After fixture back: ${await page.publicLocation()}');
      await page.until('location.search.includes("view=login")');

      // Clicking an external document reaches the host callback, while the local
      // document remains embedded. The test callback opens no external application.
      await page.execute('''
        (() => {
          const link = document.createElement('a');
          link.id = 'shell-external-link';
          link.href = 'https://flutter.dev/';
          link.target = '_blank';
          link.textContent = 'External link';
          link.style.cssText = 'position:fixed;top:40%;left:40%;z-index:2147483647;padding:12px;background:white;color:black';
          document.body.append(link);
          return true;
        })()
        ''');
      await page.tap('#shell-external-link');
      await page.untilAdapter(() => external.isNotEmpty);
      expect(external.single, Uri.parse('https://flutter.dev/'));
      expect(await page.read('location.origin'), configuration.origin.origin);

      // Exercise a native load entry point as well as the Dart navigation policy.
      // Rejected methods may throw; neither outcome may replace the app document.
      try {
        final data = Uri.parse('data:text/html,<h1>untrusted-shell-probe</h1>');
        switch (adapter) {
          case SystemWebViewAdapter system:
            await system.controller!.runJavaScript('''
              const unsafe = document.createElement('a');
              unsafe.href = ${jsonEncode(data.toString())};
              document.body.append(unsafe);
              unsafe.click();
            ''');
          case WindowsWebViewAdapter windows:
            await windows.controller!.loadUrl(
              urlRequest: URLRequest(url: WebUri(data.toString())),
            );
        }
      } catch (_) {
        // Plugin/native rejection is an acceptable result for this unsafe URI.
      }
      await tester.pump(const Duration(milliseconds: 500));
      expect(await page.read('location.origin'), configuration.origin.origin);

      await page.fill('[data-phone-input]', '700000101');
      await page.fill('input[name="password"]', 'Synthetic password');
      await page.submit('form[action\$=login]');
      await page.until(
        'document.querySelector("[data-fixture-home]") !== null',
      );
      expect(
        (await page.request('/api/account/session'))['body'],
        containsPair('phone', '256700000101'),
      );
      await adapter.reload();
      await page.until(
        'document.querySelector("[data-fixture-home]") !== null',
      );
      expect(
        (await page.request('/api/account/session'))['body'],
        containsPair('phone', '256700000101'),
      );
      await page.signOut();
      expect(
        (await page.request('/api/account/session'))['body'],
        containsPair('phone', null),
      );

      // Registration and code entry use the normal web forms. This fixture's code
      // is synthetic, and the request endpoint never contacts a message provider.
      await adapter.load(
        configuration.origin.resolve('/en/account?view=register'),
      );
      await page.until(
        'document.querySelector("form[action\$=register]") !== null',
      );
      await page.fill('[data-phone-input]', '700000101');
      await page.fill('input[name="password"]', 'Synthetic password');
      await page.submit('form[action\$=register]');
      await page.until(
        'document.querySelector("[data-account-verification]") !== null',
      );
      await page.submit('form[data-account-step-form=delivery]');
      await page.until('document.querySelector("input[name=code]") !== null');
      await page.fill('input[name="code"]', '123456');
      await page.submit('form[data-account-step-form=code]');
      await page.until(
        'document.querySelector("[data-fixture-home]") !== null',
      );
      expect(
        (await page.request('/api/account/session'))['body'],
        containsPair('phone', '256700000101'),
      );

      expect(
        (await page.request(
          '/api/account/phone',
          body: {
            'phone': '256700000102',
            'currentPassword': 'Synthetic password',
          },
        ))['status'],
        200,
      );
      expect(
        (await page.request(
          '/api/account/password',
          body: {
            'password': 'Another synthetic password',
            'currentPassword': 'Synthetic password',
          },
        ))['status'],
        200,
      );

      // Real server-side role checks still reject an ordinary synthetic member.
      expect((await page.request('/api/admin/fixture'))['status'], 401);
      await page.signOut();
      final admin = await page.request(
        '/api/account/login',
        body: {'phone': '256700000991', 'password': 'Synthetic admin password'},
      );
      expect(admin['status'], 200);
      expect((await page.request('/api/admin/fixture'))['status'], 200);
      await page.signOut();
      expect((await page.request('/api/admin/fixture'))['status'], 401);

      // The diagnostic route exists only in this generated acceptance fixture.
      // Its cookie points to an expired record, which the real session resolver
      // must reject; retaining a cookie is never sufficient authorization.
      expect(
        (await page.request('/api/shell-fixture/session', body: {}))['status'],
        200,
      );
      expect(
        (await page.request('/api/account/session'))['body'],
        containsPair('phone', null),
      );
      expect((await page.request('/api/admin/fixture'))['status'], 401);

      // Leave a persistent HttpOnly server cookie for a separate cold-process run.
      expect(
        (await page.request(
          '/api/account/login',
          body: {'phone': '256700000101', 'password': 'Synthetic password'},
        ))['status'],
        200,
      );
      expect(
        (await page.request('/api/account/session'))['body'],
        containsPair('phone', '256700000101'),
      );
      // Model the shell's normal background/close checkpoint before the host
      // force-stops this process for the separate reopen phase.
      await adapter.suspend();
      await tester.pump(const Duration(seconds: 2));
    },
    timeout: const Timeout(Duration(minutes: 5)),
  );
}

class _Page extends NativePage {
  _Page(super.tester, super.adapter);

  Future<void> tap(String selector) async {
    await _interactive();
    final target =
        await read('''
      (() => {
        const target = document.querySelector(${jsonEncode(selector)});
        target.scrollIntoView({ block: 'center', inline: 'center' });
        const rect = target.getBoundingClientRect();
        return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2,
          viewportWidth: innerWidth, viewportHeight: innerHeight };
      })()
    ''')
            as Map;
    final view = tester.getRect(
      find
          .descendant(
            of: find.byType(WebAppShell),
            matching: find.byType(Stack),
          )
          .first,
    );
    final x = (target['x'] as num).toDouble();
    final y = (target['y'] as num).toDouble();
    final width = (target['viewportWidth'] as num).toDouble();
    final height = (target['viewportHeight'] as num).toDouble();
    final point = Offset(
      view.left + x * view.width / width,
      view.top + y * view.height / height,
    );
    if (Platform.isWindows) {
      final mouse = await tester.createGesture(kind: PointerDeviceKind.mouse);
      await mouse.addPointer(location: point);
      await mouse.moveTo(point);
      await mouse.down(point);
      await mouse.up();
      await mouse.removePointer();
    } else {
      await tester.tapAt(point);
    }
    await tester.pump(const Duration(milliseconds: 200));
  }

  Future<void> fill(String selector, String value) async {
    await _interactive();
    await execute('''
      (() => {
        const input = document.querySelector(${jsonEncode(selector)});
        input.focus();
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${jsonEncode(value)});
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      })()
    ''');
    await tester.pump(const Duration(milliseconds: 200));
  }

  Future<void> submit(String selector) async {
    await _interactive();
    await until(
      'document.querySelector(${jsonEncode('$selector button[type=submit]')})?.disabled === false',
    );
    await tap('$selector button[type=submit]');
  }

  Future<void> _interactive() async {
    await documentReady();
    const phase = String.fromEnvironment(
      'SHELL_CHECK_PHASE',
      defaultValue: 'first',
    );
    if (phase != 'live') {
      await until(
        'document.documentElement.dataset.shellFixtureReady === "true"',
      );
    }
  }

  Future<Map> request(String path, {Map<String, String>? body}) async {
    await documentReady();
    await execute('''
      window.__shellAcceptanceResponse = null;
      fetch(${jsonEncode(path)}, {
        method: ${jsonEncode(body == null ? 'GET' : 'POST')},
        credentials: 'same-origin', cache: 'no-store',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        ${body == null ? '' : 'body: JSON.stringify(${jsonEncode(body)}),'}
      }).then(async response => {
        window.__shellAcceptanceResponse = { status: response.status, body: await response.json() };
      }).catch(() => { window.__shellAcceptanceResponse = { status: 0 }; });
      true;
    ''');
    await until('window.__shellAcceptanceResponse != null');
    return (await read('window.__shellAcceptanceResponse')) as Map;
  }

  Future<void> signOut() async {
    await request('/api/account/sign-out', body: {});
  }
}
