import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:path/path.dart' as path;
import 'package:path_provider/path_provider.dart';
import '../config/app_config.dart';

Future<void> _backgroundWork = Future<void>.value();

/// Data-only FCM messages have one native display owner, including cold starts.
@pragma('vm:entry-point')
Future<void> paymentReviewBackgroundMessage(RemoteMessage message) {
  return _backgroundWork = _backgroundWork.catchError((Object _) {}).then((
    _,
  ) async {
    NativePaymentAlerts? alerts;
    try {
      final config = AppConfig.fromBuildEnvironment(isAndroid: true);
      alerts = NativePaymentAlerts(
        origin: config.origin,
        environment: config.environment.name,
        onOpen: (_) {},
      );
      await alerts._initialize(background: true);
      final envelope = PaymentAlertEnvelope.parse(message.data);
      final created = DateTime.tryParse(message.data['createdAt'] ?? '');
      if (envelope != null &&
          alerts._enabled &&
          envelope.endpointId == alerts._endpointId &&
          created != null &&
          DateTime.now().difference(created).inHours < 24) {
        if (message.data['resolved'] == 'true') {
          await alerts._cancel(envelope);
        } else {
          await alerts._show(envelope);
        }
      }
    } catch (_) {
      /* A failed notification never changes a payment or access. */
    } finally {
      alerts?.dispose();
    }
  });
}

final _uuid = RegExp(
  r'^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$',
);

/// Opaque identifiers only. A notification can navigate, never make a decision.
class PaymentAlertEnvelope {
  const PaymentAlertEnvelope(this.eventId, this.paymentId, this.endpointId);
  final String eventId;
  final String? paymentId;
  final String endpointId;

  static PaymentAlertEnvelope? parse(Object? value) {
    if (value is! Map ||
        value['eventId'] is! String ||
        !_uuid.hasMatch(value['eventId']) ||
        value['endpointId'] is! String ||
        !_uuid.hasMatch(value['endpointId'])) {
      return null;
    }
    final payment = value['paymentId'];
    if (payment != null &&
        payment != '' &&
        (payment is! String || !_uuid.hasMatch(payment))) {
      return null;
    }
    return PaymentAlertEnvelope(
      value['eventId'],
      payment == '' ? null : payment,
      value['endpointId'],
    );
  }

  Uri destination(Uri origin) => origin.resolve(
    paymentId == null ? '/admin/settings' : '/payment-review/$paymentId',
  );
  Map<String, Object?> toJson() => {
    'eventId': eventId,
    'paymentId': paymentId,
    'endpointId': endpointId,
  };
}

/// Native owns display and sound. The owned web document owns authentication,
/// registration and the shared API; no cookie or financial logic crosses here.
class NativePaymentAlerts {
  NativePaymentAlerts({
    required this.origin,
    required this.environment,
    required this.onOpen,
  });
  final Uri origin;
  final String environment;
  final void Function(Uri) onOpen;
  final _notifications = FlutterLocalNotificationsPlugin();
  final _seen = <String>{};
  final _subscriptions = <StreamSubscription<dynamic>>[];
  Timer? _timer;
  Future<void>? _initialization;
  File? _stateFile;
  String? _nonce, _endpointId, _scope, _fid;
  PaymentAlertEnvelope? _pendingOpened;
  bool _enabled = false, _busy = false, _disposed = false, _baseline = true;
  bool _permissionAsked = false;
  Future<Object?> Function(String)? _evaluate;
  Future<bool> Function()? _ownsDocument;

  bool get _supported => Platform.isAndroid || Platform.isWindows;
  bool get enabled => _enabled;
  String get _transport => Platform.isAndroid ? 'fcm' : 'windows-local';

  Future<void> initialize() => _initialization ??= _initialize();
  Future<void> _initialize({bool background = false}) async {
    if (!_supported) return;
    try {
      final directory = await getApplicationSupportDirectory();
      _stateFile = File(
        path.join(
          directory.path,
          'payment-alerts-$environment-${base64Url.encode(utf8.encode(origin.origin)).replaceAll('=', '')}.json',
        ),
      );
      try {
        final state = jsonDecode(await _stateFile!.readAsString());
        _enabled = state['enabled'] == true;
        _permissionAsked = state['permissionAsked'] == true;
        _endpointId = state['endpointId'] as String?;
        _scope = state['scope'] as String?;
        _seen.addAll((state['seen'] as List).whereType<String>().take(250));
      } catch (_) {
        /* Missing/corrupt preferences default to disabled. */
      }
      await _notifications.initialize(
        settings: const InitializationSettings(
          android: AndroidInitializationSettings('payment_notification'),
          windows: WindowsInitializationSettings(
            appName: 'Goal Hint',
            appUserModelId: 'GoalHint.GoalHint',
            guid: 'd3fa2eca-814b-470b-9245-d8544847799c',
          ),
        ),
        onDidReceiveNotificationResponse: (response) {
          try {
            _open(
              PaymentAlertEnvelope.parse(jsonDecode(response.payload ?? '')),
            );
          } catch (_) {
            /* Ignore foreign/malformed activations. */
          }
        },
      );
      if (Platform.isAndroid) {
        await _notifications
            .resolvePlatformSpecificImplementation<
              AndroidFlutterLocalNotificationsPlugin
            >()
            ?.createNotificationChannel(
              const AndroidNotificationChannel(
                'payment_reviews_v1',
                'Payment reviews',
                description: 'Payments awaiting administrator review',
                importance: Importance.high,
                sound: RawResourceAndroidNotificationSound('payment_review_v1'),
              ),
            );
        if (!background && _firebaseConfigured) {
          await Firebase.initializeApp(
            options: const FirebaseOptions(
              apiKey: String.fromEnvironment('GOAL_HINT_FIREBASE_API_KEY'),
              appId: String.fromEnvironment('GOAL_HINT_FIREBASE_APP_ID'),
              messagingSenderId: String.fromEnvironment(
                'GOAL_HINT_FIREBASE_SENDER_ID',
              ),
              projectId: String.fromEnvironment(
                'GOAL_HINT_FIREBASE_PROJECT_ID',
              ),
            ),
          );
          _subscriptions.add(
            FirebaseMessaging.onMessage.listen((message) {
              final envelope = PaymentAlertEnvelope.parse(message.data);
              if (_enabled &&
                  envelope != null &&
                  envelope.endpointId == _endpointId) {
                unawaited(
                  message.data['resolved'] == 'true'
                      ? _cancel(envelope)
                      : _show(envelope),
                );
              }
            }),
          );
          _subscriptions.add(
            FirebaseMessaging.onMessageOpenedApp.listen((message) {
              _open(PaymentAlertEnvelope.parse(message.data));
            }),
          );
          _subscriptions.add(
            FirebaseMessaging.instance.onRegistered.listen((token) {
              _fid = token;
              if (_enabled) unawaited(_registerInstallation());
            }),
          );
          final initial = await FirebaseMessaging.instance.getInitialMessage();
          if (initial != null) _open(PaymentAlertEnvelope.parse(initial.data));
          if (_enabled) _fid = await _registerFirebase();
        }
      }
      if (background) return;
      final launch = await _notifications.getNotificationAppLaunchDetails();
      if (launch?.didNotificationLaunchApp == true) {
        try {
          _open(
            PaymentAlertEnvelope.parse(
              jsonDecode(launch?.notificationResponse?.payload ?? ''),
            ),
          );
        } catch (_) {
          /* Ignore malformed payloads. */
        }
      }
    } catch (_) {
      /* Notification setup must never hide the shared application. */
    }
  }

  bool get _firebaseConfigured =>
      const String.fromEnvironment('GOAL_HINT_FIREBASE_API_KEY').isNotEmpty &&
      const String.fromEnvironment('GOAL_HINT_FIREBASE_APP_ID').isNotEmpty &&
      const String.fromEnvironment('GOAL_HINT_FIREBASE_SENDER_ID').isNotEmpty &&
      const String.fromEnvironment('GOAL_HINT_FIREBASE_PROJECT_ID').isNotEmpty;

  void _open(PaymentAlertEnvelope? envelope) {
    if (_disposed ||
        !_enabled ||
        envelope == null ||
        envelope.endpointId != _endpointId) {
      return;
    }
    unawaited(_notifications.cancel(id: _notificationId(envelope.eventId)));
    _seen.add(envelope.eventId);
    unawaited(_save());
    _pendingOpened = envelope;
    onOpen(envelope.destination(origin));
  }

  int _notificationId(String id) =>
      int.parse(id.replaceAll('-', '').substring(0, 7), radix: 16);
  Future<void> _cancel(PaymentAlertEnvelope envelope) async {
    _seen.add(envelope.eventId);
    await _notifications.cancel(
      id: _notificationId(envelope.eventId),
      tag: envelope.eventId,
    );
    await _save();
  }

  Future<void> _show(PaymentAlertEnvelope envelope) async {
    if (!_enabled || !_seen.add(envelope.eventId)) return;
    await _save();
    try {
      await _notifications.show(
        id: _notificationId(envelope.eventId),
        title: envelope.paymentId == null
            ? 'Payment alert test'
            : 'Payment awaiting review',
        body: envelope.paymentId == null
            ? 'Open to check payment alerts.'
            : 'Open to review this payment.',
        notificationDetails: NotificationDetails(
          android: AndroidNotificationDetails(
            'payment_reviews_v1',
            'Payment reviews',
            importance: Importance.high,
            priority: Priority.high,
            sound: const RawResourceAndroidNotificationSound(
              'payment_review_v1',
            ),
            tag: envelope.eventId,
            onlyAlertOnce: true,
          ),
          windows: WindowsNotificationDetails(
            audio: WindowsNotificationAudio.asset(
              'assets/sounds/payment-review-v1.wav',
            ),
          ),
        ),
        payload: jsonEncode(envelope.toJson()),
      );
      await _ack(envelope, 'displayed');
    } catch (_) {
      /* Permission/DND/resource failure leaves the payment queue intact. */
    }
  }

  Future<void> _save() async {
    while (_seen.length > 250) {
      _seen.remove(_seen.first);
    }
    try {
      await _stateFile?.writeAsString(
        jsonEncode({
          'enabled': _enabled,
          'permissionAsked': _permissionAsked,
          'endpointId': _endpointId,
          'scope': _scope,
          'seen': _seen.toList(),
        }),
        flush: true,
      );
    } catch (_) {
      /* Deduplication still holds in memory. */
    }
  }

  Future<String> _registerFirebase() async {
    final token = FirebaseMessaging.instance.onRegistered.first
        .timeout(const Duration(seconds: 20), onTimeout: () => '')
        .catchError((Object _) => '');
    await FirebaseMessaging.instance.register();
    final value = await token;
    if (value.isEmpty) throw StateError('Push registration is unavailable.');
    return value;
  }

  /// Merge events recorded by the Android background isolate before handling
  /// retries in the foreground; never restore a revoked/muted session here.
  Future<void> resume() async {
    try {
      final state = jsonDecode(await _stateFile!.readAsString());
      if (state['scope'] == _scope &&
          state['endpointId'] == _endpointId &&
          state['seen'] is List) {
        _seen.addAll(
          (state['seen'] as List)
              .whereType<String>()
              .where(_uuid.hasMatch)
              .take(250),
        );
      }
    } catch (_) {
      /* The next event still deduplicates in memory. */
    }
  }

  void invalidate() {
    _nonce = null;
    _timer?.cancel();
    _timer = null;
  }

  /// Host polling drains a small top-document queue. Windows' generic native
  /// JavaScript bridge remains disabled, including for foreign frames.
  Future<void> attach({
    required Future<Object?> Function(String) evaluate,
    required Future<bool> Function() ownsDocument,
  }) async {
    await initialize();
    if (_disposed || !_supported || !await ownsDocument()) return;
    invalidate();
    _evaluate = evaluate;
    _ownsDocument = ownsDocument;
    _nonce = List.generate(
      24,
      (_) => Random.secure().nextInt(256).toRadixString(16).padLeft(2, '0'),
    ).join();
    await evaluate(_installScript(_nonce!));
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      unawaited(_drain());
    });
    final opened = _pendingOpened;
    _pendingOpened = null;
    if (opened != null) unawaited(_ack(opened, 'opened'));
    unawaited(_registerInstallation());
  }

  Future<void> _drain() async {
    final nonce = _nonce;
    if (_busy || nonce == null || _disposed || !await _ownsDocument!()) return;
    _busy = true;
    try {
      final raw = await _evaluate!(
        'window.goalHintPaymentAlerts?.drain(${jsonEncode(nonce)}) ?? "[]"',
      );
      if (_nonce != nonce || !await _ownsDocument!()) return;
      Object? messages = raw;
      for (var count = 0; count < 2 && messages is String; count++) {
        if (messages.length > 32768) return;
        messages = jsonDecode(messages);
      }
      if (messages is! List || messages.length > 10) return;
      for (final message in messages) {
        if (message is! Map) continue;
        final action = message['action'];
        Map<String, Object?> result = {};
        try {
          if (action == 'enable') {
            if (Platform.isAndroid) {
              if (!_firebaseConfigured) {
                throw StateError(
                  'Android alerts are not configured for this build. Use the payment queue.',
                );
              }
              final current = await FirebaseMessaging.instance
                  .getNotificationSettings();
              if (_permissionAsked &&
                  current.authorizationStatus == AuthorizationStatus.denied) {
                throw StateError('Allow notifications in system settings.');
              }
              _permissionAsked = true;
              await _save();
              final permission =
                  current.authorizationStatus == AuthorizationStatus.authorized
                  ? current
                  : await FirebaseMessaging.instance.requestPermission();
              if (permission.authorizationStatus !=
                  AuthorizationStatus.authorized) {
                throw StateError('Allow notifications in system settings.');
              }
              await FirebaseMessaging.instance.setAutoInitEnabled(true);
              _fid = await _registerFirebase();
              if (_fid == null) {
                throw StateError('Push registration is unavailable.');
              }
            }
            _enabled = true;
            await _save();
            result = {
              'registration': {
                'transport': _transport,
                'subscription': Platform.isAndroid
                    ? {'fid': _fid}
                    : <String, Object?>{},
              },
            };
          } else if (action == 'settings') {
            await _notifications.openAppNotificationSettings();
          } else if (action == 'mute' || action == 'logout') {
            await _mute();
          } else if (action == 'feed') {
            await _feed(message['body']);
          } else if (action == 'bound') {
            if (message['endpointId'] is String &&
                _uuid.hasMatch(message['endpointId'])) {
              _endpointId = message['endpointId'];
              await _save();
            }
          }
        } catch (error) {
          result = {
            'error': error is StateError
                ? error.message
                : 'Native alerts are unavailable.',
          };
        }
        if (message['id'] is String &&
            _nonce == nonce &&
            await _ownsDocument!()) {
          await _evaluate!(
            'window.goalHintPaymentAlerts?.reply(${jsonEncode(nonce)}, ${jsonEncode(message['id'])}, ${jsonEncode(result)})',
          );
        }
      }
    } catch (_) {
      /* Retry a transient WebView inspection failure next tick. */
    } finally {
      _busy = false;
    }
  }

  Future<void> _mute() async {
    _enabled = false;
    _endpointId = null;
    _seen.clear();
    await _notifications.cancelAll();
    await _save();
    if (Platform.isAndroid && _firebaseConfigured && Firebase.apps.isNotEmpty) {
      await FirebaseMessaging.instance.setAutoInitEnabled(false);
      await FirebaseMessaging.instance.unregister();
    }
  }

  Future<void> _feed(Object? body) async {
    if (body is! Map) return;
    if (body['unauthorized'] == true) {
      await _mute();
      return;
    }
    if (body['events'] is! List ||
        (body['events'] as List).length > 50 ||
        body['scope'] is! String) {
      return;
    }
    if (_scope != body['scope']) {
      _scope = body['scope'];
      _seen.clear();
      _baseline = true;
    }
    final endpoints = body['endpoints'];
    final endpoint = endpoints is List
        ? endpoints
              .whereType<Map>()
              .where(
                (endpoint) =>
                    endpoint['transport'] == _transport &&
                    endpoint['enabled'] == true,
              )
              .firstOrNull
        : null;
    if (!_enabled || body['enabled'] != true || endpoint == null) {
      await _notifications.cancelAll();
      return;
    }
    _endpointId = endpoint['id'] as String?;
    if (_endpointId == null) return;
    final active = <String>{};
    for (final event in body['events']) {
      if (event is! Map) continue;
      final envelope = PaymentAlertEnvelope.parse({
        ...event,
        'eventId': event['id'],
        'endpointId': _endpointId,
      });
      if (envelope == null) continue;
      active.add(envelope.eventId);
      // FCM owns Android background display. Only Windows needs running-host discovery.
      if (Platform.isWindows) {
        final createdAt = DateTime.tryParse('${event['createdAt']}');
        if ((_baseline && envelope.paymentId != null) ||
            createdAt == null ||
            DateTime.now().difference(createdAt).inSeconds > 60) {
          _seen.add(envelope.eventId);
        } else {
          await _show(envelope);
        }
      }
    }
    _baseline = false;
    final notifications = await _notifications.getActiveNotifications();
    for (final notification in notifications) {
      if (!active.any(
        (event) =>
            _notificationId(event) == notification.id ||
            notification.tag == event,
      )) {
        if (notification.id != null) {
          await _notifications.cancel(
            id: notification.id!,
            tag: notification.tag,
          );
        }
      }
    }
    await _save();
  }

  Future<void> _registerInstallation() async {
    if (!_enabled ||
        _fid == null ||
        _nonce == null ||
        !await _ownsDocument!()) {
      return;
    }
    await _evaluate!(
      'window.goalHintPaymentAlerts?.registerInstallation(${jsonEncode(_nonce)}, ${jsonEncode(_fid)})',
    );
  }

  Future<void> _ack(PaymentAlertEnvelope envelope, String state) async {
    if (_nonce == null || !await _ownsDocument!()) return;
    await _evaluate!(
      'window.goalHintPaymentAlerts?.ack(${jsonEncode(_nonce)}, ${jsonEncode(envelope.toJson())}, ${jsonEncode(state)})',
    );
  }

  String _installScript(String nonce) =>
      '''
(() => {
  if (window.top !== window || location.origin !== ${jsonEncode(origin.origin)}) return;
  const nonce = ${jsonEncode(nonce)}, queue = [], pending = new Map();
  let counter = 0, lastSync = 0, syncing = false;
  const send = (action, extra = {}) => { if(queue.length < 10) queue.push({action, ...extra}); };
  async function read(options = {}) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(),15000);
    try { const response = await fetch('/api/admin/payment-alerts',{cache:'no-store',credentials:'same-origin',...options,signal:controller.signal});
      return {ok:response.ok,status:response.status,body:await response.json()};
    } finally { clearTimeout(timer); }
  }
  async function post(body) {
    const response = await read({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    if(!response.ok) throw new Error(response.body.message || 'Alerts unavailable.'); return response.body;
  }
  function call(action, extra = {}) {
    if(pending.size) return Promise.reject(new Error('An alert request is in progress.'));
    const id = String(++counter);
    return new Promise((resolve,reject) => { const timer = setTimeout(() => { pending.delete(id); reject(new Error('Native alerts timed out.')); },60000); pending.set(id,{resolve,reject,timer}); send(action,{id,...extra}); });
  }
  async function sync() {
    if(syncing) return; syncing = true; lastSync = Date.now();
    try { const response = await read();
      if(response.status === 401 || response.status === 403) send('feed',{body:{unauthorized:true}});
      else if(response.ok) send('feed',{body:response.body});
    } catch(_) {} finally { syncing = false; }
  }
  const bridge = Object.freeze({
    async request(action) {
      if(!['enable','mute','test','settings'].includes(action) || (navigator.userActivation && !navigator.userActivation.isActive)) throw new Error('Use the payment alert controls.');
      if(action === 'settings') { await call('settings'); return {message:'System notification settings opened.'}; }
      if(action === 'enable') { const result = await call('enable'); const endpoint = await post({action:'register',registration:result.registration}); await call('bound',{endpointId:endpoint.id}); await sync(); return {message:${jsonEncode(Platform.isWindows ? 'Windows alerts enabled. Keep Goal Hint running to receive them.' : 'Android alerts enabled. System notification settings apply.')}}; }
      if(action === 'mute') await call('mute');
      const response = await read(); if(!response.ok) throw new Error('Sign in again.');
      const body = response.body, endpoint = body.endpoints.find(e => e.transport === ${jsonEncode(_transport)});
      if(!endpoint) throw new Error('Enable alerts first.');
      await post({action,endpointId:endpoint.id}); await sync();
      return {message: action === 'test' ? 'Test queued. Delivery has not been confirmed.' : 'Native alerts muted.'};
    },
    drain(key) { if(key !== nonce || window.top !== window) return '[]'; if(Date.now()-lastSync >= 15000 && document.querySelector('[data-admin-payments-link]')) void sync(); return JSON.stringify(queue.splice(0,10)); },
    reply(key,id,result) { if(key !== nonce) return; const request = pending.get(id); if(!request) return; clearTimeout(request.timer); pending.delete(id); if(result.error) request.reject(new Error(result.error)); else request.resolve(result); },
    async registerInstallation(key,fid) { if(key !== nonce) return; try { const endpoint = await post({action:'register',registration:{transport:'fcm',subscription:{fid}}}); send('bound',{endpointId:endpoint.id}); } catch(_) {} },
    clear() { return call('logout'); },
    async ack(key,data,state) { if(key === nonce) try { await post({action:'ack',endpointId:data.endpointId,eventId:data.eventId,state}); } catch(_) {} }
  });
  Object.defineProperty(window,'goalHintPaymentAlerts',{configurable:true,value:bridge});
  window.addEventListener('goal-hint-payment-sign-out',() => send('logout'));
  if(document.querySelector('[data-admin-payments-link]')) void sync();
})();
''';

  void dispose() {
    _disposed = true;
    invalidate();
    for (final subscription in _subscriptions) {
      unawaited(subscription.cancel());
    }
  }
}
