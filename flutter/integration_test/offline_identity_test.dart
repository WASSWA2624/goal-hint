import 'dart:convert';
import 'dart:io';

import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:goal_hint/app.dart';
import 'package:goal_hint/config/app_config.dart';
import 'package:goal_hint/web/navigation_policy.dart';
import 'package:goal_hint/web/windows_web_view.dart';
import 'package:integration_test/integration_test.dart';

import 'support/native_page.dart';

const _phase = String.fromEnvironment(
  'OFFLINE_IDENTITY_PHASE',
  defaultValue: 'seed-a',
);
const _phases = [
  'seed-a',
  'cold-a',
  'switch-b',
  'cold-b',
  'logout',
  'cold-logout',
  'cleanup',
  'reset',
];
const _cachePrefix = 'goal-hint-offline-';

/// Separate native processes retain ordinary HTTP cookies and the same profile.
/// The operator stops only the owned loopback server for each cold phase.
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  testWidgets(
    'native private identities never enter anonymous offline storage',
    (tester) async {
      expect(Platform.isWindows, isTrue);
      expect(_phases, contains(_phase));
      debugPrint('Offline identity phase $_phase started; nativePid=$pid.');
      final configuration = AppConfig.fromBuildEnvironment(isAndroid: false);
      expect(configuration.environment, AppEnvironment.development);
      expect(configuration.origin.host, 'offline-identity.localhost');
      expect(configuration.origin.port, isNot(3000));
      final browser = WindowsWebViewAdapter(
        configuration: configuration,
        navigationPolicy: NavigationPolicy(configuration.origin),
        openExternal: (_) async => false,
      );
      final page = NativePage(tester, browser);
      await tester.pumpWidget(
        GoalHintApp(configuration: configuration, webViewAdapter: browser),
      );
      try {
        await page.untilAdapter(() => browser.ready || browser.error != null);
        expect(browser.ready, isTrue);
        if (_phase.startsWith('cold-')) {
          await _saved(page);
          await _auditCaches(page);
          await _offlineRefusals(page);
          // Revisit the exact URL that held A/B's private HTML online.
          await browser.load(configuration.origin.resolve('/en'));
          await _saved(page);
        } else {
          await _online(page);
          if (_phase == 'cleanup' || _phase == 'reset') {
            if (_phase == 'reset') await _signOut(page);
            await _identity(page, null);
            await _noQueuedWrites(page);
            await _readyCache(page);
            await _auditCaches(page);
            final cleaned = await page.readAsync('''
            (async () => {
              window.dispatchEvent(new Event('pagehide'));
              const owned = (await caches.keys()).filter(name => name.startsWith('$_cachePrefix'));
              for (const name of owned) await caches.delete(name);
              for (const registration of await navigator.serviceWorker.getRegistrations()) {
                if (registration.scope === location.origin + '/' &&
                    registration.active?.scriptURL === location.origin + '/offline-worker.js') await registration.unregister();
              }
              return (await caches.keys()).every(name => !name.startsWith('$_cachePrefix'));
            })()
          ''');
            expect(cleaned, isTrue);
          } else {
            await _readyCache(page);
            await _noQueuedWrites(page);
            if (_phase == 'seed-a') {
              await _identity(page, null);
              await _login(page, 'A');
            } else if (_phase == 'switch-b') {
              // A is server-recognized after a real offline process termination.
              await _identity(page, 'A');
              await _login(page, 'B');
            } else {
              expect(_phase, 'logout');
              await _identity(page, 'B');
              await _signOut(page);
            }
            await _auditCaches(page);
            await browser.load(configuration.origin.resolve('/offline'));
            await _saved(page);
            await browser.suspend();
            await tester.pump(const Duration(seconds: 2));
          }
        }
        expect(browser.error, isNull);
        debugPrint(
          'Offline identity phase $_phase passed; nativePid=$pid; private cache audit passed.',
        );
      } finally {
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.pump();
      }
    },
    timeout: const Timeout(Duration(minutes: 4)),
  );
}

Future<void> _online(NativePage page) async {
  await page.until(
    'document.querySelector("[data-offline-identity-fixture]") !== null',
  );
  await page.documentReady();
  expect(await page.read('isSecureContext'), isTrue);
  expect(await page.read('typeof window.flutter_inappwebview'), 'undefined');
}

Future<void> _readyCache(NativePage page) async {
  await page.until(
    'document.documentElement.dataset.offlineCache === "ready" && '
    'navigator.serviceWorker.controller !== null',
    timeout: const Duration(seconds: 85),
  );
}

Future<void> _identity(NativePage page, String? identity) async {
  final status =
      await page.readAsync('''
    fetch('/api/account/identity', { cache: 'no-store' }).then(response => response.json())
  ''')
          as Map;
  expect(status['identity'], identity);
  expect(status['httpOnlyCookiePresent'], identity != null);
  expect(
    await page.read("document.cookie.includes('goal-hint-member=')"),
    isFalse,
  );
  expect(
    await page.read(
      'document.querySelector("[data-offline-identity-fixture]").dataset.identity',
    ),
    identity ?? 'anonymous',
  );
}

Future<void> _signOut(NativePage page) async {
  final signedOut =
      await page.readAsync('''
    fetch('/api/account/sign-out', { method: 'POST', headers: { accept: 'application/json' } })
      .then(response => ({ ok: response.ok }))
  ''')
          as Map;
  expect(signedOut['ok'], isTrue);
  final origin = Uri.parse(await page.read('location.origin') as String);
  // Inspect the actual server header without depending on browser JS exposing
  // this browser-processed field. This stateless request copies no cookie.
  final client = HttpClient()..connectionTimeout = const Duration(seconds: 5);
  try {
    final endpoint = origin
        .replace(host: '127.0.0.1')
        .resolve('/api/account/sign-out');
    final request = await client.postUrl(endpoint);
    request.headers.set('origin', endpoint.origin);
    request.headers.set('accept', 'application/json');
    final response = await request.close();
    expect(response.statusCode, 200);
    expect(response.headers.value('clear-site-data'), '"cache"');
    await response.drain<void>();
  } finally {
    client.close(force: true);
  }
  await page.adapter.load(origin.resolve('/en'));
  await _online(page);
  await _identity(page, null);
  // Preserve the real logout header; reprepare anonymous content online.
  await _readyCache(page);
  final privateRead =
      await page.readAsync('''
    fetch('/api/account/private', { cache: 'no-store' }).then(response => ({
      status: response.status, noStore: /no-store/i.test(response.headers.get('cache-control') ?? '')
    }))
  ''')
          as Map;
  expect(privateRead['status'], 401);
  expect(privateRead['noStore'], isTrue);
}

Future<void> _login(NativePage page, String identity) async {
  final phone = identity == 'A' ? '256700000701' : '256700000702';
  final loggedIn =
      await page.readAsync('''
    fetch('/api/account/login', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ phone: ${jsonEncode(phone)}, password: 'Synthetic fixture password' }) })
      .then(response => ({ ok: response.ok, noStore: /no-store/i.test(response.headers.get('cache-control') ?? '') }))
  ''')
          as Map;
  expect(loggedIn['ok'], isTrue);
  expect(loggedIn['noStore'], isTrue);
  final origin = Uri.parse(await page.read('location.origin') as String);
  await page.adapter.load(origin.resolve('/en'));
  await _online(page);
  await _identity(page, identity);
  final checks =
      await page.readAsync('''
    (async () => {
      const privateResponse = await fetch('/api/account/private', { cache: 'no-store' });
      const body = await privateResponse.json();
      const rscResponse = await fetch('/en?_rsc=offline-identity-native', { headers: { RSC: '1' }, cache: 'no-store' });
      const rsc = await rscResponse.text();
      return { privateOk: privateResponse.ok,
        privateNoStore: /no-store/i.test(privateResponse.headers.get('cache-control') ?? ''),
        correctPrivateValue: body.phone === ${jsonEncode(phone)} && body.prediction === 'synthetic-protected-prediction-' + ${jsonEncode(identity)},
        rscOk: rscResponse.ok, rscNoStore: /no-store/i.test(rscResponse.headers.get('cache-control') ?? ''),
        rscHasPrivate: rsc.includes('synthetic-private-member-') && rsc.includes(${jsonEncode(phone)}),
        rscType: (rscResponse.headers.get('content-type') ?? '').split(';')[0].trim() === 'text/x-component',
        oldIdentityAbsent: !document.body.innerText.includes('synthetic-private-member-' + (${jsonEncode(identity)} === 'A' ? 'B' : 'A')) };
    })()
  ''')
          as Map;
  expect(
    checks.values.every((value) => value == true),
    isTrue,
    reason: 'Private HTTP/RSC boundary failed: $checks',
  );
}

Future<void> _saved(NativePage page) async {
  await page.until(
    'document.querySelector("[data-offline-view]")?.dataset.offlineState === "saved"',
  );
  await page.documentReady();
  expect(
    await page.read(
      'document.querySelector("[data-offline-fixture],[data-private-fixture],[data-offline-identity-fixture]") === null',
    ),
    isTrue,
  );
  expect(
    await page.read("document.body.innerText.includes('Saved Home United')"),
    isTrue,
  );
  expect(
    await page.read(
      "!/synthetic-private|synthetic-protected|25670000070[12]|a{43}|b{43}/.test(document.documentElement.outerHTML)",
    ),
    isTrue,
  );
}

Future<void> _noQueuedWrites(NativePage page) async {
  await page.tester.pump(const Duration(seconds: 3));
  final stats =
      await page.readAsync(
            "fetch('/api/account/fixture-write', { cache: 'no-store' }).then(response => response.json())",
          )
          as Map;
  expect(
    stats['writeAttempts'],
    0,
    reason: 'An offline write was queued or replayed.',
  );
}

Future<void> _offlineRefusals(NativePage page) async {
  final refused =
      await page.readAsync('''
    (async () => {
      const privateUnavailable = await fetch('/api/account/private', { cache: 'no-store' }).then(() => false, () => true);
      const writeUnavailable = await fetch('/api/account/fixture-write', { method: 'POST',
        headers: { 'content-type': 'application/json' }, body: '{"synthetic":true}' }).then(() => false, () => true);
      return { privateUnavailable, writeUnavailable };
    })()
  ''')
          as Map;
  expect(refused['privateUnavailable'], isTrue);
  expect(refused['writeUnavailable'], isTrue);
}

Future<void> _auditCaches(NativePage page) async {
  final audit =
      await page.readAsync(
            r'''
    (async () => {
      let count = 0, publicOnly = true, noPrivateBytes = true, noPrivatePolicy = true;
      const forbidden = /synthetic-private|synthetic-protected|25670000070[12]|a{43}|b{43}/;
      for (const name of (await caches.keys()).filter(name => name.startsWith('__CACHE_PREFIX__'))) {
        const cache = await caches.open(name);
        for (const request of await cache.keys()) {
          const url = new URL(request.url), response = await cache.match(request);
          count++;
          publicOnly &&= url.origin === location.origin && !url.search && (
            ['/offline','/offline-cache/active','/offline-cache/record','/offline-cache/snapshot',
              '/brand/goal-hint-logo-inverse.svg','/brand/goal-hint-mark-primary.svg'].includes(url.pathname)
            || /^\/_next\/static\/.+\.(?:js|css|woff2?|ttf|otf|png|svg|ico)$/i.test(url.pathname));
          noPrivateBytes &&= !forbidden.test(await response.clone().text());
          if (!['/offline-cache/active','/offline-cache/record'].includes(url.pathname))
            noPrivatePolicy &&= !/(?:^|,)\s*(?:no-store|private)\b/i.test(response.headers.get('cache-control') ?? '');
        }
      }
      return { count, publicOnly, noPrivateBytes, noPrivatePolicy };
    })()
  '''
                .replaceAll('__CACHE_PREFIX__', _cachePrefix),
          )
          as Map;
  expect(audit['count'], greaterThan(0));
  expect(audit['publicOnly'], isTrue);
  expect(audit['noPrivateBytes'], isTrue);
  expect(audit['noPrivatePolicy'], isTrue);
}
