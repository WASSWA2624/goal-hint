import 'dart:async';
import 'dart:convert';
import 'dart:ui';

import 'package:flutter_test/flutter_test.dart';
import 'package:goal_hint/web/native_invitation_share.dart';
import 'package:share_plus/share_plus.dart';

void main() {
  final origin = Uri.parse('https://goalhint.com');
  const anchor = Rect.fromLTWH(10, 20, 300, 400);
  final url = 'https://goalhint.com/r/${'a' * 32}';
  String nonce(String script) =>
      RegExp(r'const nonce = "([a-f0-9]+)"').firstMatch(script)!.group(1)!;
  Map<String, Object> request(String token) => {
    'id': '1',
    'nonce': token,
    'title': 'Goal Hint',
    'text': 'Join me on Goal Hint.',
    'url': url,
  };

  test(
    'only bounded canonical referral requests for the current document are accepted',
    () {
      final bridge = NativeInvitationShare(),
          token = nonce(NativeInvitationShare().installScript(origin));
      final valid = request(token);
      expect(NativeInvitationRequest.parse(jsonEncode(valid), token)?.url, url);
      for (final data in [
        {...valid, 'nonce': 'old-document'},
        {...valid, 'url': 'https://example.test/r/${'a' * 32}'},
        {...valid, 'url': '$url?token=private'},
        {...valid, 'url': 'javascript:alert(1)'},
        {...valid, 'text': 'x' * 513},
        {...valid, 'text': '\u0000'},
        {...valid, 'extra': 'private'},
        {...valid, 'id': '<script>'},
      ]) {
        expect(NativeInvitationRequest.parse(jsonEncode(data), token), isNull);
      }
      expect(NativeInvitationRequest.parse('invalid json', token), isNull);
      expect(NativeInvitationRequest.parse(jsonEncode(valid), null), isNull);
      expect(
        nonce(bridge.installScript(origin)),
        isNot(nonce(bridge.installScript(origin))),
      );
    },
  );

  test(
    'native sheet receives one public link and a popover anchor; cancellation and failure return to web',
    () async {
      for (final status in [
        ShareResultStatus.success,
        ShareResultStatus.dismissed,
        ShareResultStatus.unavailable,
        null,
      ]) {
        final bridge = NativeInvitationShare(), scripts = <String>[];
        final token = nonce(bridge.installScript(origin));
        await bridge.handle(
          jsonEncode(request(token)),
          ownsDocument: () async => true,
          evaluate: (script) async {
            scripts.add(script);
          },
          anchor: anchor,
          share: (params) async {
            expect(params.text, 'Join me on Goal Hint.\n$url');
            expect(params.sharePositionOrigin, anchor);
            if (status == null) throw StateError('synthetic unavailable');
            return ShareResult('', status);
          },
        );
        expect(
          scripts.single,
          contains(
            status == null
                ? 'failed'
                : status == ShareResultStatus.dismissed
                ? 'cancelled'
                : 'handed-off',
          ),
        );
      }
    },
  );

  test(
    'concurrent requests open one sheet and navigation prevents stale responses',
    () async {
      final bridge = NativeInvitationShare(), scripts = <String>[];
      final token = nonce(bridge.installScript(origin)),
          completion = Completer<ShareResult>();
      var opens = 0;
      Future<void> send() => bridge.handle(
        jsonEncode(request(token)),
        ownsDocument: () async => true,
        evaluate: (script) async {
          scripts.add(script);
        },
        anchor: anchor,
        share: (_) {
          opens++;
          return completion.future;
        },
      );
      final first = send(), second = send();
      await Future<void>.delayed(Duration.zero);
      expect(opens, 1);
      bridge.invalidate();
      completion.complete(const ShareResult('', ShareResultStatus.success));
      await Future.wait([first, second]);
      expect(scripts, isEmpty);
      await send();
      expect(opens, 1);
    },
  );

  test('foreign or inactive documents cannot open the native sheet', () async {
    final bridge = NativeInvitationShare(),
        token = nonce(bridge.installScript(origin));
    await bridge.handle(
      jsonEncode(request(token)),
      ownsDocument: () async => false,
      evaluate: (_) async {
        fail('Unexpected response');
      },
      anchor: anchor,
      share: (_) async {
        fail('Unexpected native sheet');
      },
    );
  });
}
