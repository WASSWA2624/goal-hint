import 'package:flutter_test/flutter_test.dart';
import 'package:goal_hint/web/windows_web_view.dart';

import 'native_page.dart';

/// Public document/cache observations for the Windows reconnection acceptance.
class ReconnectionPage extends NativePage {
  ReconnectionPage(super.tester, super.adapter);

  Future<Map> cacheStatus() async =>
      await readAsync('''
        fetch('/offline-cache/status', { cache: 'no-store', credentials: 'omit' })
          .then(response => response.json())
      ''')
          as Map;

  Future<Map> snapshot() async =>
      await readAsync('''
        fetch('/offline-cache/snapshot', { cache: 'no-store', credentials: 'omit' })
          .then(response => response.json())
      ''')
          as Map;

  Future<void> observeLifecycle() async {
    await execute('''
      (() => {
        if (window.__goalHintReconnectEvents) return true;
        window.__goalHintReconnectEvents = [];
        const record = event => window.__goalHintReconnectEvents.push({
          type: event.type, visible: document.visibilityState,
          online: navigator.onLine, at: performance.now()
        });
        for (const type of ['online', 'offline', 'focus', 'blur', 'pageshow', 'pagehide']) {
          window.addEventListener(type, record);
        }
        document.addEventListener('visibilitychange', record);
        return true;
      })()
    ''');
  }

  Future<List> lifecycleEvents() async =>
      await read('window.__goalHintReconnectEvents ?? []') as List;

  Future<Map> refreshState() async =>
      await read('''
        (() => {
          const data = document.documentElement.dataset;
          return { phase: data.offlineUpdate, connection: data.offlineConnection,
            cache: data.offlineCache, version: data.offlineVersion,
            attempts: Number(data.offlineAttempts ?? 0),
            problem: data.offlineProblem ?? null,
            retryAt: data.offlineRetryAt ? Number(data.offlineRetryAt) : null };
        })()
      ''')
          as Map;

  /// The same readonly action exposed by the web Saved view's check button.
  Future<void> requestCheck() async {
    await execute('''
      window.dispatchEvent(new Event('goal-hint-offline-check')); true;
    ''');
  }

  Future<void> floodHints() async {
    await execute('''
      for (let index = 0; index < 40; index++) {
        window.dispatchEvent(new Event(index % 2 ? 'online' : 'offline'));
      }
      true;
    ''');
  }

  /// Overrides only this test WebView's connectivity hint, not OS networking.
  ///
  /// The fixture's actual unavailable/failed responses independently establish
  /// that service-worker requests cannot reach a valid application response.
  Future<void> connectivityHint({required bool online}) async {
    final browser = adapter;
    if (browser is! WindowsWebViewAdapter) {
      throw UnsupportedError(
        'This acceptance only controls a Windows WebView.',
      );
    }
    await browser.controller!.callDevToolsProtocolMethod(
      methodName: 'Network.overrideNetworkState',
      parameters: {
        'offline': !online,
        'latency': 0,
        'downloadThroughput': -1,
        'uploadThroughput': -1,
      },
    );
    await until('navigator.onLine === $online');
  }

  /// Adds an unsent, test-only draft outside the application's managed tree.
  ///
  /// No account form is submitted. The document nonce also detects reloads that
  /// could otherwise recreate an apparently matching field or scroll position.
  Future<Map> installDraft() async {
    await documentReady();
    await execute('''
      (() => {
        window.__goalHintReconnectDocument = crypto.randomUUID();
        const section = document.createElement('section');
        section.id = 'native-reconnection-probe';
        section.style.cssText = 'min-height:2400px;padding-top:500px';
        const form = document.createElement('form');
        form.addEventListener('submit', event => event.preventDefault());
        const label = document.createElement('label');
        label.textContent = 'Synthetic unsent draft';
        const input = document.createElement('input');
        input.id = 'native-reconnection-draft';
        input.value = 'Preserve this synthetic draft';
        input.setAttribute('aria-label', 'Synthetic unsent draft');
        label.append(input); form.append(label); section.append(form);
        document.body.append(section);
        history.replaceState({ ...(history.state ?? {}), goalHintDraft: 'retained' },
          '', location.pathname + '?draft=retained#editing');
        window.scrollTo(0, 600);
        input.focus({ preventScroll: true });
        input.setSelectionRange(2, 8);
        return true;
      })()
    ''');
    await tester.pump(const Duration(milliseconds: 300));
    final state = await draftState();
    expect(state['scrollY'], greaterThan(0));
    expect(state['focus'], 'native-reconnection-draft');
    return state;
  }

  Future<Map> draftState() async =>
      await read('''
        (() => {
          const input = document.querySelector('#native-reconnection-draft');
          return { document: window.__goalHintReconnectDocument,
            href: location.href, historyLength: history.length,
            navigationState: history.state?.goalHintDraft,
            scrollY, value: input?.value, start: input?.selectionStart,
            end: input?.selectionEnd, focus: document.activeElement?.id };
        })()
      ''')
          as Map;

  Future<void> expectDraftUnchanged(Map initial) async {
    expect(
      await draftState(),
      initial,
      reason: 'Cache refresh must preserve the current document and draft.',
    );
  }
}
