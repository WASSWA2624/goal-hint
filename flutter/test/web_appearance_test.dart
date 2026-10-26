import 'dart:async';
import 'dart:convert';

import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:goal_hint/web/web_appearance.dart';

Map<String, Object> appearance(String scheme) => {
  'version': 1,
  'scheme': scheme,
  'background': '#03111F',
  'surface': '#041525',
  'foreground': '#F4F7FF',
  'accent': '#00B9F2',
  'chrome': '#052451',
};

void main() {
  test(
    'public appearance decodes native result shapes with value equality',
    () {
      final content = jsonEncode(appearance('dark'));
      final value = WebAppearance.parse(content)!;
      expect(value.brightness, Brightness.dark);
      expect(value.background, const Color(0xFF03111F));
      expect(value.surface, const Color(0xFF041525));
      expect(value.foreground, const Color(0xFFF4F7FF));
      expect(value.accent, const Color(0xFF00B9F2));
      expect(value.chrome, const Color(0xFF052451));
      expect(WebAppearance.parse(jsonEncode(content)), value);
      expect(WebAppearance.parse(appearance('dark')), value);
      expect(WebAppearance.parse(appearance('dark')).hashCode, value.hashCode);
      expect(
        WebAppearance.parse(appearance('light'))!.brightness,
        Brightness.light,
      );
    },
  );

  test('malformed, expanded, private and unsupported metadata is rejected', () {
    for (final value in [
      null,
      true,
      'null',
      '{}',
      'not json',
      'x' * 1025,
      {...appearance('dark'), 'version': 1.0},
      {...appearance('dark'), 'version': 2},
      {...appearance('dark'), 'scheme': 'system'},
      {...appearance('dark'), 'phone': 'private'},
      {...appearance('dark')}..remove('chrome'),
      {...appearance('dark'), 'background': '#00000000'},
      {...appearance('dark'), 'surface': 'red'},
      {...appearance('dark'), 'accent': 123},
      jsonEncode(jsonEncode(jsonEncode(appearance('dark')))),
    ]) {
      expect(WebAppearance.parse(value), isNull, reason: '$value');
    }
  });

  testWidgets(
    'foreground reads coalesce unchanged colors and stop when hidden',
    (tester) async {
      var reads = 0;
      var dark = false;
      final published = <WebAppearance>[];
      final sampler = WebAppearanceSampler(
        read: () async {
          reads++;
          return appearance(dark ? 'dark' : 'light');
        },
        onChanged: published.add,
      );
      addTearDown(sampler.dispose);
      sampler.setActive(true);
      await tester.pump();
      expect(reads, 1);
      expect(published.single.brightness, Brightness.light);
      await tester.pump(const Duration(seconds: 1));
      expect(reads, 2);
      expect(published, hasLength(1));
      dark = true;
      await tester.pump(const Duration(seconds: 1));
      expect(published.last.brightness, Brightness.dark);
      sampler.setActive(false);
      await tester.pump(const Duration(seconds: 5));
      expect(reads, 3);
      sampler.setActive(true);
      await tester.pump();
      expect(reads, 4);
      sampler.dispose();
      await tester.pump(const Duration(seconds: 5));
      expect(reads, 4);
    },
  );

  testWidgets(
    'pending reads never overlap and stale documents cannot publish',
    (tester) async {
      var reads = 0;
      final first = Completer<Object?>();
      final published = <WebAppearance>[];
      final sampler = WebAppearanceSampler(
        read: () {
          reads++;
          return reads == 1 ? first.future : Future.value(appearance('dark'));
        },
        onChanged: published.add,
      );
      addTearDown(sampler.dispose);
      sampler.setActive(true);
      await tester.pump(const Duration(seconds: 10));
      sampler.refresh();
      sampler.setActive(false);
      sampler.setActive(true);
      expect(reads, 1);
      first.complete(appearance('light'));
      await tester.pump();
      expect(reads, 2);
      expect(published.single.brightness, Brightness.dark);
      sampler.dispose();
    },
  );

  testWidgets('disposed pending reads and transient failures do not publish', (
    tester,
  ) async {
    final pending = Completer<Object?>();
    var published = 0;
    final sampler = WebAppearanceSampler(
      read: () => pending.future,
      onChanged: (_) => published++,
    );
    sampler.setActive(true);
    sampler.dispose();
    pending.complete(appearance('dark'));
    await tester.pump();
    expect(published, 0);

    var reads = 0;
    final recovery = WebAppearanceSampler(
      read: () async {
        if (++reads == 1) throw StateError('Document changed');
        return appearance('light');
      },
      onChanged: (_) => published++,
    );
    addTearDown(recovery.dispose);
    recovery.setActive(true);
    await tester.pump();
    expect(published, 0);
    await tester.pump(const Duration(seconds: 1));
    expect(published, 1);
    recovery.dispose();
  });
}
