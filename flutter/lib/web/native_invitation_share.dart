import 'dart:convert';
import 'dart:math';
import 'dart:ui';

import 'package:share_plus/share_plus.dart';

/// A narrow public-link bridge; identity, attribution and rewards stay in web.
class NativeInvitationRequest {
  const NativeInvitationRequest(this.id, this.title, this.text, this.url);

  final String id;
  final String title;
  final String text;
  final String url;

  static NativeInvitationRequest? parse(String message, String? nonce) {
    if (nonce == null || message.length > 2048) return null;
    try {
      final data = jsonDecode(message);
      if (data is! Map ||
          data.length != 5 ||
          data['nonce'] != nonce ||
          data['id'] is! String ||
          !RegExp(r'^[0-9]{1,10}$').hasMatch(data['id']) ||
          data['title'] is! String ||
          data['title'] != 'Goal Hint' ||
          data['text'] is! String ||
          (data['text'] as String).trim().isEmpty ||
          (data['text'] as String).length > 512 ||
          RegExp(r'[\x00-\x08\x0b-\x1f\x7f]').hasMatch(data['text']) ||
          data['url'] is! String ||
          !RegExp(
            r'^https://goalhint\.com/r/[a-f0-9]{32}$',
          ).hasMatch(data['url'])) {
        return null;
      }
      return NativeInvitationRequest(
        data['id'],
        data['title'],
        data['text'],
        data['url'],
      );
    } on FormatException {
      return null;
    }
  }
}

class NativeInvitationShare {
  String? _nonce;
  bool _sharing = false;

  void invalidate() => _nonce = null;

  /// The nonce stays in a top-document closure, inaccessible to foreign frames.
  String installScript(Uri origin) {
    final random = Random.secure();
    _nonce = List.generate(
      24,
      (_) => random.nextInt(256).toRadixString(16).padLeft(2, '0'),
    ).join();
    return '''
(() => {
  if (window.top !== window || location.origin !== ${jsonEncode(origin.origin)}) return;
  const nonce = ${jsonEncode(_nonce)}, pending = new Map();
  let counter = 0;
  const bridge = Object.freeze({version: 1, share(data) {
    if (navigator.userActivation && !navigator.userActivation.isActive) return Promise.reject(new DOMException('Click Share to continue.', 'NotAllowedError'));
    if (pending.size) return Promise.reject(new DOMException('Sharing is in progress.', 'InvalidStateError'));
    const id = String(++counter);
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { pending.delete(id); reject(new Error('Sharing timed out.')); }, 120000);
      pending.set(id, {resolve, reject, timeout});
      GoalHintInvitationShare.postMessage(JSON.stringify({id, nonce, title: data.title, text: data.text, url: data.url}));
    });
  }});
  window.addEventListener('goalhint:native-share-result', event => {
    if (event.detail?.nonce !== nonce) return;
    const request = pending.get(event.detail.id);
    if (!request) return;
    clearTimeout(request.timeout); pending.delete(event.detail.id);
    if (event.detail.result === 'failed') request.reject(new Error('Sharing is unavailable.'));
    else request.resolve(event.detail.result);
  });
  Object.defineProperty(window, 'goalHintNativeShare', {configurable: true, value: bridge});
  window.dispatchEvent(new Event('goalhint:native-share-ready'));
})();
''';
  }

  /// Recheck document ownership before opening and before returning a result.
  Future<void> handle(
    String message, {
    required Future<bool> Function() ownsDocument,
    required Future<void> Function(String) evaluate,
    required Rect anchor,
    Future<ShareResult> Function(ShareParams)? share,
  }) async {
    final nonce = _nonce;
    final request = NativeInvitationRequest.parse(message, nonce);
    if (request == null || _sharing) return;
    Future<bool> owned() async {
      try {
        return await ownsDocument();
      } catch (_) {
        return false;
      }
    }

    if (!await owned() || _nonce != nonce || _sharing) {
      return;
    }
    _sharing = true;
    var result = 'failed';
    try {
      final outcome = await (share ?? SharePlus.instance.share)(
        ShareParams(
          title: request.title,
          text: '${request.text}\n${request.url}',
          sharePositionOrigin: anchor,
        ),
      );
      // Some platforms cannot identify the chosen action; do not claim delivery.
      result = outcome.status == ShareResultStatus.dismissed
          ? 'cancelled'
          : 'handed-off';
    } catch (_) {
      // The web panel keeps explicit social links and manual copying available.
    } finally {
      _sharing = false;
    }
    if (_nonce != nonce || !await owned()) return;
    try {
      await evaluate(
        "window.dispatchEvent(new CustomEvent('goalhint:native-share-result', {detail: ${jsonEncode({'nonce': nonce, 'id': request.id, 'result': result})}}));",
      );
    } catch (_) {
      // Navigation/disposal does not need feedback in the replacement document.
    }
  }
}
