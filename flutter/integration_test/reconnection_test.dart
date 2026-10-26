import 'dart:io';

import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:goal_hint/app.dart';
import 'package:goal_hint/config/app_config.dart';
import 'package:goal_hint/web/navigation_policy.dart';
import 'package:goal_hint/web/web_view_factory.dart';
import 'package:integration_test/integration_test.dart';

import 'support/offline_fixture_control.dart';
import 'support/reconnection_page.dart';

/// Windows-only acceptance against the owned, synthetic loopback fault proxy.
///
/// The host stops/restarts that proxy between phases. Android validation remains
/// excluded at the owner's request. Every phase retains the browser profile.
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets(
    'reconnection preserves a working app and cache',
    (tester) async {
      expect(
        Platform.isWindows,
        isTrue,
        reason: 'This acceptance is Windows-only.',
      );
      const phase = String.fromEnvironment(
        'RECONNECT_CHECK_PHASE',
        defaultValue: 'seed',
      );
      expect(['seed', 'failures', 'recover', 'final-cold'], contains(phase));
      final config = AppConfig.fromBuildEnvironment(isAndroid: false);
      expect(config.environment, AppEnvironment.development);
      expect(['127.0.0.1', 'localhost'], contains(config.origin.host));
      expect(config.origin.port, isNot(3000));
      final fixture = OfflineFixtureControl.fromEnvironment();
      await fixture.configure(
        generation: phase == 'seed' || phase == 'failures' ? 'A' : 'B',
        authState: phase == 'recover' || phase == 'final-cold'
            ? 'expired'
            : 'active',
      );
      final browser = createWebViewAdapter(
        configuration: config,
        navigationPolicy: NavigationPolicy(config.origin),
        openExternal: (_) async => false,
      );
      final page = ReconnectionPage(tester, browser);
      final lifecycle = _NativeLifecycle();
      WidgetsBinding.instance.addObserver(lifecycle);
      await tester.pumpWidget(
        GoalHintApp(configuration: config, webViewAdapter: browser),
      );
      try {
        await page.untilAdapter(() => browser.ready || browser.error != null);
        expect(browser.ready, isTrue);
        if (phase == 'seed' || phase == 'failures') {
          await page.until(
            'document.querySelector("[data-offline-fixture]") !== null',
          );
          await page.until(
            'document.documentElement.dataset.offlineConnection === "reachable" && '
            'document.documentElement.dataset.offlineUpdate === "idle" && navigator.serviceWorker.controller !== null',
            timeout: const Duration(seconds: 80),
          );
        } else {
          // The proxy is stopped: only the retained complete browser cache can
          // supply this document and its matching assets/public snapshot.
          await page.until(
            'document.querySelector("[data-offline-view]")?.dataset.offlineState === "saved"',
          );
          await page.documentReady();
          expect(browser.error, isNull);
          expect(browser.hasDocument, isTrue);
        }

        debugPrint(
          'Native reconnection user agent: ${await page.read('navigator.userAgent')}',
        );
        if (phase == 'seed') {
          final baseline = await _cacheIdentity(page);
          expect(baseline['dataVersion'], '1');
          await fixture.save({
            'schemaVersion': 1,
            'origin': config.origin.toString(),
            'A': baseline,
          });
          await browser.suspend();
          debugPrint('Native reconnection baseline A committed.');
        } else {
          final saved = await fixture.saved();
          expect(saved['origin'], config.origin.toString());
          if (phase == 'failures') {
            await _failures(page, fixture, saved);
          } else if (phase == 'recover') {
            await _recover(page, fixture, saved, lifecycle);
          } else {
            expect(await _cacheIdentity(page), saved['B']);
            expect(
              (await fixture.stats())['writes'],
              saved['writesAfterAttempt'],
            );
            debugPrint('Native current-generation B cold startup passed.');
          }
        }
      } finally {
        // These are test-WebView protocol hints, never host networking settings.
        try {
          await page.connectivityHint(online: true);
        } catch (_) {
          /* The browser may already be disposed. */
        }
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.pump();
        WidgetsBinding.instance.removeObserver(lifecycle);
      }
    },
    timeout: const Timeout(Duration(minutes: 12)),
  );
}

Future<Map> _cacheIdentity(ReconnectionPage page) async {
  final status = await page.cacheStatus();
  expect(status['ok'], isTrue);
  final snapshot = await page.snapshot();
  final records = snapshot['records'] as List;
  expect(records, isNotEmpty);
  return {
    'version': status['version'],
    'capturedAt': status['capturedAt'],
    'expiresAt': status['expiresAt'],
    'dataVersion': (records.first as Map)['dataVersion'],
  };
}

Future<void> _retained(ReconnectionPage page, Map saved, Map draft) async {
  expect(
    await _cacheIdentity(page),
    saved['A'],
    reason: 'A failed update must retain exactly the working bundle.',
  );
  await page.expectDraftUnchanged(draft);
}

Future<Map> _waitFailure(
  ReconnectionPage page,
  int previousAttempts,
  List<String> problems, {
  String? connection,
}) async {
  await page.until(
    'Number(document.documentElement.dataset.offlineAttempts ?? 0) > $previousAttempts && '
    'document.documentElement.dataset.offlineUpdate === "waiting"',
    timeout: const Duration(seconds: 80),
  );
  final state = await page.refreshState();
  expect(problems, contains(state['problem']));
  if (connection != null) expect(state['connection'], connection);
  return state;
}

Future<Map> _faultCheck(
  ReconnectionPage page,
  OfflineFixtureControl fixture,
  Map saved,
  Map draft, {
  required String target,
  required String mode,
  required List<String> problems,
  String? connection,
}) async {
  await fixture.configure(generation: 'B', target: target, mode: mode);
  final before = await page.refreshState();
  await page.requestCheck();
  final state = await _waitFailure(
    page,
    before['attempts'] as int,
    problems,
    connection: connection,
  );
  await _retained(page, saved, draft);
  debugPrint('Native rejected $target/$mode; working A and draft retained.');
  return state;
}

Future<void> _failures(
  ReconnectionPage page,
  OfflineFixtureControl fixture,
  Map saved,
) async {
  expect(await _cacheIdentity(page), saved['A']);
  final draft = await page.installDraft();
  await page.observeLifecycle();
  var failed = await _faultCheck(
    page,
    fixture,
    saved,
    draft,
    target: 'manifest',
    mode: '503',
    problems: ['server-unavailable'],
    connection: 'unreachable',
  );

  // Observe a genuine automatic retry. Do not advance browser time or invoke
  // the manual check action to make the backoff assertion pass.
  failed = await _waitFailure(page, failed['attempts'] as int, [
    'server-unavailable',
  ], connection: 'unreachable');
  final retryEvents = _events(await fixture.stats())
      .where(
        (event) =>
            event['category'] == 'manifest' &&
            event['generation'] == 'B' &&
            (event['fault'] as Map?)?['mode'] == '503',
      )
      .toList();
  expect(retryEvents.length, greaterThanOrEqualTo(2));
  expect(
    (retryEvents.last['atMs'] as int) -
        (retryEvents[retryEvents.length - 2]['atMs'] as int),
    greaterThanOrEqualTo(4500),
  );
  await _retained(page, saved, draft);

  final beforeHints = await page.refreshState();
  final manifestBefore = _requests(await fixture.stats(), 'manifest');
  await page.connectivityHint(online: false);
  debugPrint('Native restored refresh state: ${await page.refreshState()}');
  await page.connectivityHint(online: true);
  await page.floodHints();
  await page.tester.pump(const Duration(milliseconds: 400));
  final afterHints = await page.refreshState();
  expect(afterHints['attempts'], beforeHints['attempts']);
  expect(afterHints['retryAt'], beforeHints['retryAt']);
  expect(_requests(await fixture.stats(), 'manifest'), manifestBefore);
  await page.expectDraftUnchanged(draft);

  await _faultCheck(
    page,
    fixture,
    saved,
    draft,
    target: 'snapshot',
    mode: 'captive',
    problems: ['response-policy', 'unexpected-response', 'invalid-snapshot'],
    connection: 'unusable',
  );
  await _faultCheck(
    page,
    fixture,
    saved,
    draft,
    target: 'snapshot',
    mode: '401',
    problems: ['authentication-required'],
    connection: 'authentication-required',
  );
  await _faultCheck(
    page,
    fixture,
    saved,
    draft,
    target: 'asset',
    mode: 'missing',
    problems: ['unexpected-response'],
  );
  await _faultCheck(
    page,
    fixture,
    saved,
    draft,
    target: 'asset',
    mode: 'delay-headers',
    problems: ['network-timeout'],
    connection: 'unreachable',
  );
  await _faultCheck(
    page,
    fixture,
    saved,
    draft,
    target: 'asset',
    mode: 'truncate',
    problems: ['network-unreachable', 'integrity-failure'],
  );

  // This single synthetic POST has no database or real account behind it. Its
  // failed transport must not turn into a queued/replayed success later.
  await fixture.configure(
    generation: 'B',
    target: 'private',
    mode: 'disconnect',
    authState: 'expired',
  );
  final writesBefore = (await fixture.stats())['writes'] as int;
  final result =
      await page.readAsync('''
    fetch('/api/account/fixture', { method: 'POST', credentials: 'same-origin',
      cache: 'no-store', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ synthetic: true }) })
      .then(response => ({ status: response.status })).catch(() => ({ status: 0 }))
  ''')
          as Map;
  expect(result['status'], 0);
  final writesAfter = (await fixture.stats())['writes'] as int;
  expect(writesAfter, inInclusiveRange(writesBefore, writesBefore + 1));
  await _retained(page, saved, draft);
  await fixture.save({...saved, 'writesAfterAttempt': writesAfter});

  // Dispose while a changed-asset request is held. Closing the actual browser
  // must abort its owner and prevent later retries after the shell is gone.
  await fixture.configure(
    generation: 'B',
    target: 'asset',
    mode: 'stall-body',
    delayMs: 12000,
  );
  final sequence = (await fixture.stats())['sequence'] as int;
  await page.requestCheck();
  await _waitStats(
    page,
    fixture,
    (stats) => _events(stats).any(
      (event) =>
          (event['sequence'] as int) > sequence &&
          event['category'] == 'asset' &&
          event['finishedAtMs'] == null,
    ),
  );
  final closedAt = DateTime.now().millisecondsSinceEpoch;
  await page.tester.pumpWidget(const SizedBox.shrink());
  await page.tester.pump();
  await _waitStats(
    page,
    fixture,
    (stats) => _events(stats).any(
      (event) =>
          (event['sequence'] as int) > sequence &&
          event['category'] == 'asset' &&
          event['aborted'] == true,
    ),
  );
  final closedStats = await fixture.stats();
  final interrupted = _events(closedStats).lastWhere(
    (event) =>
        (event['sequence'] as int) > sequence && event['category'] == 'asset',
  );
  expect(
    interrupted['elapsedMs'],
    lessThan(4000),
    reason:
        'Shell disposal must abort before the normal eight-second body deadline.',
  );
  expect((interrupted['finishedAtMs'] as int) - closedAt, lessThan(3000));
  final manifestsAtClose = _requests(closedStats, 'manifest');
  await page.tester.pump(const Duration(seconds: 6));
  expect(_requests(await fixture.stats(), 'manifest'), manifestsAtClose);
  await fixture.signal('failures-complete', {'retained': 'A'});
  debugPrint(
    'Native failed updates, interruption, cancellation and retry teardown passed.',
  );
}

Future<void> _recover(
  ReconnectionPage page,
  OfflineFixtureControl fixture,
  Map saved,
  _NativeLifecycle lifecycle,
) async {
  expect(await _cacheIdentity(page), saved['A']);
  await page.until(
    'document.documentElement.dataset.offlineUpdate === "waiting"',
  );
  expect((await page.refreshState())['connection'], 'unreachable');
  await page.observeLifecycle();
  final draft = await page.installDraft();
  final start = lifecycle.states.length;
  await fixture.signal('minimize-restore', {
    'holdMs': 12000,
    'proxyMustRemainStopped': true,
  });
  debugPrint(
    'NATIVE_RECONNECT_CHECKPOINT minimize-restore pid=$pid file=${fixture.checkpoint.path}',
  );
  await _waitNative(
    page,
    () =>
        lifecycle.states.skip(start).contains(AppLifecycleState.hidden) &&
        lifecycle.states.last == AppLifecycleState.resumed,
  );
  final events = (await page.lifecycleEvents()).cast<Map>();
  debugPrint(
    'Actual native lifecycle: ${lifecycle.states}; web events: $events',
  );
  expect(
    events.any(
      (event) =>
          event['type'] == 'visibilitychange' && event['visible'] == 'hidden',
    ),
    isTrue,
    reason:
        'Actual window minimize must hide the browser; a Flutter-only lifecycle simulation is insufficient.',
  );
  expect(
    events.any(
      (event) =>
          event['type'] == 'visibilitychange' && event['visible'] == 'visible',
    ),
    isTrue,
  );
  await page.expectDraftUnchanged(draft);

  // The proxy is still stopped. Only now may the host restore healthy B; an
  // early visibility failure cannot accidentally replace A before a retry.
  await page.connectivityHint(online: false);
  await fixture.signal('restore-server', {
    'generation': 'B',
    'onlineHint': false,
  });
  debugPrint(
    'NATIVE_RECONNECT_CHECKPOINT restore-server pid=$pid file=${fixture.checkpoint.path}',
  );
  await page.until(
    'document.documentElement.dataset.offlineConnection === "reachable" && '
    'document.documentElement.dataset.offlineUpdate === "idle" && '
    'document.documentElement.dataset.offlineVersion !== "${(saved['A'] as Map)['version']}"',
    timeout: const Duration(minutes: 6),
  );
  expect(
    await page.read('navigator.onLine'),
    isFalse,
    reason:
        'Successful real reads, not the connectivity hint, establish reachability.',
  );
  await page.expectDraftUnchanged(draft);
  final updated = await _cacheIdentity(page);
  expect(updated['dataVersion'], '2');
  expect(updated['version'], isNot((saved['A'] as Map)['version']));
  final privateRead =
      await page.readAsync('''
    fetch('/api/account/fixture', { cache: 'no-store', credentials: 'same-origin' })
      .then(response => ({ status: response.status, policy: response.headers.get('cache-control') }))
  ''')
          as Map;
  expect(privateRead['status'], 401);
  expect(privateRead['policy'], contains('no-store'));
  expect((await fixture.stats())['writes'], saved['writesAfterAttempt']);
  await fixture.save({
    ...saved,
    'B': updated,
    'nativeLifecycle': lifecycle.states.map((value) => value.name).toList(),
    'webLifecycle': events,
  });
  await fixture.signal('recovery-complete', {'accepted': 'B'});
  debugPrint(
    'Native B recovery, foreground/draft preservation and no write replay passed.',
  );
}

int _requests(Map stats, String category) =>
    ((stats['requests'] as Map)[category] as int?) ?? 0;
Iterable<Map> _events(Map stats) => (stats['events'] as List).cast<Map>();

Future<void> _waitStats(
  ReconnectionPage page,
  OfflineFixtureControl fixture,
  bool Function(Map) predicate,
) async {
  final end = DateTime.now().add(const Duration(seconds: 40));
  while (DateTime.now().isBefore(end)) {
    if (predicate(await fixture.stats())) return;
    await page.tester.pump(const Duration(milliseconds: 100));
  }
  fail('Owned fixture did not reach the required request state.');
}

Future<void> _waitNative(
  ReconnectionPage page,
  bool Function() predicate,
) async {
  final end = DateTime.now().add(const Duration(minutes: 5));
  while (DateTime.now().isBefore(end)) {
    if (predicate()) return;
    await page.tester.pump(const Duration(milliseconds: 100));
  }
  fail('The owned test window did not complete actual minimize/restore.');
}

class _NativeLifecycle with WidgetsBindingObserver {
  final states = <AppLifecycleState>[];
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) => states.add(state);
}
