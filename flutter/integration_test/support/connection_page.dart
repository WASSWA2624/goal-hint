import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';

import 'native_page.dart';

Future<void> expectConnectionPage(NativePage page, {String? retryPath}) async {
  await page.until('document.querySelector("[data-offline-view]") !== null');
  await page.documentReady();
  expect(page.adapter.error, isNull);
  expect(page.adapter.hasDocument, isTrue);
  expect(await page.read('document.title'), contains('Goal Hint'));
  expect(
    await page.read(
      'document.querySelector("[data-offline-view] h1").textContent',
    ),
    'Couldn’t load this page',
  );
  final target = retryPath == null
      ? 'location.pathname + location.search'
      : jsonEncode(retryPath);
  await page.until('''
    (() => {
      const retry = document.querySelector('[data-offline-view] a');
      if (!retry || retry.textContent.trim() !== 'Try again' || !retry.getClientRects().length) return false;
      const url = new URL(retry.href);
      return url.origin === location.origin && (url.pathname + url.search) === ($target);
    })()
  ''');
  expect(
    await page.read('''
    document.querySelector('[data-offline-saved-at], [data-match-card], '
      + '[data-offline-view] form, [data-offline-view] input') === null
  '''),
    isTrue,
    reason: 'The connection page contains no saved records or write controls.',
  );
}

Future<void> retryConnectionPage(NativePage page) async {
  await page.execute(
    "setTimeout(() => document.querySelector('[data-offline-view] a').click(), 0)",
  );
}
