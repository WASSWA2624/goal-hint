import 'dart:convert';
import 'dart:io';

import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:goal_hint/app.dart';
import 'package:goal_hint/config/app_config.dart';
import 'package:goal_hint/web/navigation_policy.dart';
import 'package:goal_hint/web/web_view_factory.dart';
import 'package:integration_test/integration_test.dart';

import 'support/native_page.dart';

const _cachePrefix = 'goal-hint-offline-';

/// Runs separate processes against an owned, production-like public fixture.
///
/// The host stops that server between online and offline phases. It must retain
/// the installed application/profile (`--no-uninstall`) and the same origin.
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('durable anonymous web startup', (tester) async {
    final configuration = AppConfig.fromBuildEnvironment(
      isAndroid: Platform.isAndroid,
    );
    expect(configuration.environment, AppEnvironment.development);
    expect(
      ['localhost', '127.0.0.1', '::1'],
      contains(configuration.origin.host),
      reason: 'Use an owned loopback fixture; Android reaches it through ADB.',
    );
    expect(configuration.origin.port, isNot(3000));
    final adapter = createWebViewAdapter(
      configuration: configuration,
      navigationPolicy: NavigationPolicy(configuration.origin),
      openExternal: (_) async => false,
    );
    final page = NativePage(tester, adapter);
    await tester.pumpWidget(
      GoalHintApp(configuration: configuration, webViewAdapter: adapter),
    );
    await page.untilAdapter(() => adapter.ready || adapter.error != null);
    expect(adapter.ready, isTrue);

    const phase = String.fromEnvironment(
      'OFFLINE_CHECK_PHASE',
      defaultValue: 'online',
    );

    if (phase == 'first') {
      // Run before this fixture origin has ever initialized an offline cache.
      // No server response succeeds and the native Retry state is honest.
      await page.untilAdapter(() => adapter.error != null);
      await tester.pump();
      expect(adapter.hasDocument, isFalse);
      expect(find.text('Retry'), findsOneWidget);
    } else if (phase == 'online' || phase == 'diagnostic') {
      await page.until(
        'document.querySelector("[data-offline-fixture]") !== null',
      );
      expect(await page.read('isSecureContext'), isTrue);
      expect(await page.read('"serviceWorker" in navigator'), isTrue);
      if (phase == 'diagnostic') {
        final result =
            await page.readAsync('''
          (async () => {
            const details = {};
            try {
              const prior = await navigator.serviceWorker.getRegistrations();
              details.registrations = prior.map(value => ({
                scope: value.scope, active: value.active?.state,
                installing: value.installing?.state, waiting: value.waiting?.state
              }));
              const registration = await navigator.serviceWorker.register(
                '/offline-worker.js', { scope: '/', updateViaCache: 'none' });
              const ready = registration.active ? registration : await Promise.race([
                navigator.serviceWorker.ready,
                new Promise((_, reject) => setTimeout(() => reject(new Error('Worker activation timeout')), 15000))
              ]);
              const reply = await Promise.race([
                new Promise(resolve => {
                  const channel = new MessageChannel();
                  channel.port1.onmessage = event => {
                    channel.port1.close(); resolve(event.data);
                  };
                  ready.active.postMessage({ type: 'PREPARE' }, [channel.port2]);
                }),
                new Promise(resolve => setTimeout(() => resolve({ ok: false, error: 'reply-timeout' }), 55000))
              ]);
              return { ...details, reply, controller: navigator.serviceWorker.controller?.scriptURL };
            } catch (error) {
              return { ...details, registrationError: { name: error.name, message: error.message } };
            }
          })()
        ''', timeout: const Duration(seconds: 80))
                as Map;
        debugPrint('Public offline worker diagnostic: ${jsonEncode(result)}');
        expect(result['registrationError'], isNull);
        expect((result['reply'] as Map)['ok'], isTrue);
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.pump();
        return;
      }
      await page.until(
        'document.documentElement.dataset.offlineCache === "ready" && '
        'typeof document.documentElement.dataset.offlineVersion === "string" && '
        'navigator.serviceWorker.controller !== null',
        timeout: const Duration(seconds: 80),
      );
      expect(adapter.error, isNull);
      await _inspectOwnedCaches(page);
      // Verify a real anonymous document, not a retained screenshot or open tab.
      await adapter.load(configuration.origin.resolve('/offline'));
      await _expectSavedView(page);
      await adapter.suspend();
      await tester.pump(const Duration(seconds: 2));
    } else {
      expect(
        ['offline', 'uncached', 'corrupt', 'evicted'],
        contains(phase),
        reason: 'Unknown OFFLINE_CHECK_PHASE.',
      );
      await _expectSavedView(page);
      await _inspectOwnedCaches(page);
      if (phase == 'uncached') {
        await adapter.load(
          configuration.origin.resolve('/uncached-native-acceptance'),
        );
        await _expectUnavailable(page);
      } else if (phase == 'corrupt') {
        // Corrupt the exact app-owned integrity record in every retained bundle,
        // so a valid previous bundle cannot mask this recovery condition.
        final changed =
            await page.readAsync('''
          caches.keys().then(names => Promise.all(names
            .filter(name => name.startsWith('${_cachePrefix}bundle-v1-'))
            .map(async name => {
              const cache = await caches.open(name);
              await cache.put(new URL('/offline-cache/record', location.origin),
                new Response('invalid acceptance metadata', {
                  headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
                }));
              return true;
            })))
        ''')
                as List;
        expect(changed, isNotEmpty);
        await adapter.reload();
        await _expectUnavailable(page);
      } else if (phase == 'evicted') {
        // Scoped ownership is deliberate: do not clear browser cookies, other
        // application stores, unrelated caches, or the user's normal profile.
        final cleared =
            await page.readAsync('''
          caches.keys().then(names => Promise.all(names
            .filter(name => name.startsWith('$_cachePrefix'))
            .map(name => caches.delete(name))))
        ''')
                as List;
        expect(cleared, isNotEmpty);
        expect(cleared.every((result) => result == true), isTrue);
        await adapter.reload();
        await _expectUnavailable(page);
      }
    }

    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump();
  }, timeout: const Timeout(Duration(minutes: 3)));
}

Future<void> _expectSavedView(NativePage page) async {
  await page.until(
    'document.querySelector("[data-offline-view]")?.dataset.offlineState === "saved"',
  );
  await page.documentReady();
  expect(page.adapter.error, isNull);
  expect(page.adapter.hasDocument, isTrue);
  expect(await page.read('document.title'), contains('Goal Hint'));
  expect(
    await page.read('''
    (() => {
      const stamp = document.querySelector('[data-offline-saved-at]');
      return stamp !== null && Number.isFinite(Date.parse(
        stamp.getAttribute('datetime') ?? stamp.dataset.offlineSavedAt));
    })()
  '''),
    isTrue,
    reason: 'Cached content must expose its actual saved time.',
  );
  expect(
    await page.read('''
    document.querySelector('[data-offline-view] form[method="post" i], '
      + '[data-offline-view] input[type="password"]') === null
  '''),
    isTrue,
    reason: 'Offline reads must not expose server-dependent writes.',
  );
}

Future<void> _inspectOwnedCaches(NativePage page) async {
  final origin = await page.read('location.origin') as String;
  final records =
      await page.readAsync('''
    caches.keys().then(names => Promise.all(names
      .filter(name => name.startsWith('$_cachePrefix'))
      .map(async name => ({ name,
        entries: await (async () => {
          const cache = await caches.open(name);
          return Promise.all((await cache.keys()).map(async request => ({
            url: request.url,
            cacheControl: (await cache.match(request)).headers.get('cache-control')
          })));
        })()
      }))))
  ''')
          as List;
  expect(records, isNotEmpty, reason: 'A committed durable cache must exist.');
  for (final record in records.cast<Map>()) {
    for (final entry in (record['entries'] as List).cast<Map>()) {
      final uri = Uri.parse(entry['url'] as String);
      expect(
        uri.origin,
        origin,
        reason: 'Cross-origin media is not permitted.',
      );
      // These exact records are worker-created integrity/pointer metadata,
      // never fetched application/API responses or personal content.
      if (![
        '/offline-cache/active',
        '/offline-cache/record',
      ].contains(uri.path)) {
        expect(
          RegExp(
            r'(?:^|,)\s*(?:no-store|private)(?:\s|,|=|$)',
            caseSensitive: false,
          ).hasMatch(entry['cacheControl'] as String? ?? ''),
          isFalse,
          reason:
              'Private/no-store responses must not enter the offline store.',
        );
      }
      expect(uri.hasQuery, isFalse, reason: 'No RSC/private query responses.');
      expect(
        {
              '/offline',
              '/offline-cache/active',
              '/offline-cache/record',
              '/offline-cache/snapshot',
              '/brand/goal-hint-logo-inverse.svg',
              '/brand/goal-hint-mark-primary.svg',
            }.contains(uri.path) ||
            RegExp(
              r'^/_next/static/.+\.(?:js|css|woff2?|ttf|otf|png|svg|ico)$',
              caseSensitive: false,
            ).hasMatch(uri.path),
        isTrue,
        reason:
            'Only approved entry, assets, snapshot and metadata are stored.',
      );
    }
  }
}

Future<void> _expectUnavailable(NativePage page) async {
  final deadline = DateTime.now().add(const Duration(seconds: 40));
  while (DateTime.now().isBefore(deadline)) {
    if (page.adapter.error != null) {
      await page.tester.pump();
      expect(find.text('Retry'), findsOneWidget);
      return;
    }
    try {
      if (await page.read(
            'document.querySelector("[data-offline-view]")?.dataset.offlineState === "unavailable"',
          ) ==
          true) {
        return;
      }
    } catch (_) {
      // Native error documents can replace the JavaScript context on failure.
    }
    await page.tester.pump(const Duration(milliseconds: 200));
  }
  fail(
    'Missing cache/uncached navigation did not show an honest recovery state.',
  );
}
