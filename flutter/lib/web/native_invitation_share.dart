import 'dart:convert';
import 'dart:math';
import 'dart:ui';
import 'dart:typed_data';

import 'package:share_plus/share_plus.dart';

/// Generated PNG bytes only: no filesystem paths, remote URLs or arbitrary types.
class NativeSlipImage {
  const NativeSlipImage(this.name, this.bytes);
  final String name;
  final Uint8List bytes;

  static NativeSlipImage? parse(Object? value, String token) {
    if (value is! Map ||
        value.length != 2 ||
        value['name'] is! String ||
        value['data'] is! String) {
      return null;
    }
    final name = value['name'] as String, encoded = value['data'] as String;
    if (!RegExp('^goal-hint-$token(?:-[0-9]{2,3})?\\.png\$').hasMatch(name) ||
        encoded.length > 5592408) {
      return null;
    }
    try {
      final bytes = base64Decode(encoded);
      if (bytes.length < 33 ||
          bytes.length > 4 * 1024 * 1024 ||
          base64Encode(bytes) != encoded ||
          bytes.take(8).join(',') != '137,80,78,71,13,10,26,10' ||
          ascii.decode(bytes.sublist(12, 16), allowInvalid: true) != 'IHDR') {
        return null;
      }
      final header = ByteData.sublistView(bytes);
      if (header.getUint32(8) != 13 ||
          header.getUint32(16) != 1080 ||
          header.getUint32(20) < 1 ||
          header.getUint32(20) > 8192) {
        return null;
      }
      return NativeSlipImage(name, bytes);
    } on FormatException {
      return null;
    }
  }
}

/// One document-bound public-link/PNG bridge; account and access rules stay in web.
class NativeInvitationRequest {
  const NativeInvitationRequest(
    this.id,
    this.title,
    this.text,
    this.url, [
    this.images = const [],
  ]);

  final String id;
  final String title;
  final String text;
  final String url;
  final List<NativeSlipImage> images;

  static NativeInvitationRequest? parse(String message, String? nonce) {
    if (nonce == null || message.length > 16 * 1024 * 1024 + 8192) return null;
    try {
      final data = jsonDecode(message);
      if (data is! Map ||
          (data.length != 5 && data.length != 6) ||
          data.keys.any(
            (key) =>
                !['id', 'nonce', 'title', 'text', 'url', 'files'].contains(key),
          ) ||
          data['nonce'] != nonce ||
          data['id'] is! String ||
          !RegExp(r'^[0-9]{1,10}$').hasMatch(data['id']) ||
          data['title'] is! String ||
          data['title'] != 'Goal Hint' ||
          data['text'] is! String ||
          (data['text'] as String).trim().isEmpty ||
          (data['text'] as String).length > 4096 ||
          RegExp(r'[\x00-\x08\x0b-\x1f\x7f]').hasMatch(data['text']) ||
          data['url'] is! String ||
          !RegExp(
            r'^https://goalhint\.com/(?:r|s)/[a-f0-9]{32}$',
          ).hasMatch(data['url'])) {
        return null;
      }
      final slip = (data['url'] as String).contains('/s/');
      if (!slip &&
          ((data['text'] as String).length > 512 ||
              data.containsKey('files'))) {
        return null;
      }
      final images = <NativeSlipImage>[];
      if (data.containsKey('files')) {
        final files = data['files'];
        if (!slip || files is! List || files.isEmpty || files.length > 32) {
          return null;
        }
        var bytes = 0;
        for (final file in files) {
          final image = NativeSlipImage.parse(
            file,
            (data['url'] as String).split('/').last,
          );
          if (image == null ||
              images.any((existing) => existing.name == image.name)) {
            return null;
          }
          bytes += image.bytes.length;
          if (bytes > 12 * 1024 * 1024) return null;
          images.add(image);
        }
      }
      return NativeInvitationRequest(
        data['id'],
        data['title'],
        data['text'],
        data['url'],
        images,
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
  function send(data, files) {
    if (navigator.userActivation && !navigator.userActivation.isActive) return Promise.reject(new DOMException('Click Share to continue.', 'NotAllowedError'));
    if (pending.size) return Promise.reject(new DOMException('Sharing is in progress.', 'InvalidStateError'));
    const id = String(++counter);
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { pending.delete(id); reject(new Error('Sharing timed out.')); }, 120000);
      pending.set(id, {resolve, reject, timeout});
      GoalHintInvitationShare.postMessage(JSON.stringify({id, nonce, title: data.title, text: data.text, url: data.url, ...(files ? {files} : {})}));
    });
  }
  const bridge = Object.freeze({version: 1, share(data) { return send(data); }, shareFiles(data) { return send(data, data.files); }});
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
          text: request.text.contains(request.url)
              ? request.text
              : '${request.text}\n${request.url}',
          files: request.images.isEmpty
              ? null
              : request.images
                    .map(
                      (image) =>
                          XFile.fromData(image.bytes, mimeType: 'image/png'),
                    )
                    .toList(),
          fileNameOverrides: request.images.isEmpty
              ? null
              : request.images.map((image) => image.name).toList(),
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
