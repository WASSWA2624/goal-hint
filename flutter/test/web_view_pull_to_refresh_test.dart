import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:goal_hint/web/web_view_pull_to_refresh.dart';

Widget host({
  required ValueNotifier<bool> loading,
  required VoidCallback refresh,
  bool enabled = true,
  bool atTop = true,
  double keyboardInset = 0,
  VoidCallback? tap,
  GestureDragUpdateCallback? drag,
}) => MaterialApp(
  home: Scaffold(
    body: MediaQuery(
      data: MediaQueryData(viewInsets: EdgeInsets.only(bottom: keyboardInset)),
      child: ValueListenableBuilder<bool>(
        valueListenable: loading,
        builder: (context, value, _) => WebViewPullToRefresh(
          enabled: enabled,
          atTop: atTop,
          loading: value,
          onRefresh: refresh,
          child: GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: tap,
            onVerticalDragUpdate: drag,
            child: const ColoredBox(color: Colors.white),
          ),
        ),
      ),
    ),
  ),
);

void main() {
  testWidgets(
    'a deliberate top pull refreshes once on release and waits for loading',
    (tester) async {
      final loading = ValueNotifier(false);
      addTearDown(loading.dispose);
      var reloads = 0;
      await tester.pumpWidget(
        host(
          loading: loading,
          refresh: () {
            reloads++;
            loading.value = true;
          },
        ),
      );
      final view = find.byType(WebViewPullToRefresh);
      final touch = await tester.startGesture(tester.getCenter(view));
      await touch.moveBy(const Offset(0, 140));
      await tester.pump();
      expect(reloads, 0);
      expect(find.byType(RefreshProgressIndicator), findsOneWidget);
      await touch.up();
      await tester.pump();
      expect(reloads, 1);
      expect(
        tester
            .widget<RefreshProgressIndicator>(
              find.byType(RefreshProgressIndicator),
            )
            .value,
        isNull,
      );
      await tester.drag(view, const Offset(0, 160));
      await tester.pump();
      expect(
        reloads,
        1,
        reason: 'An in-flight document reload cannot be started twice.',
      );
      loading.value = false;
      await tester.pumpAndSettle();
      expect(find.byType(RefreshProgressIndicator), findsNothing);
    },
  );

  testWidgets(
    'short, upward, horizontal, cancelled and mouse gestures never reload',
    (tester) async {
      final loading = ValueNotifier(false);
      addTearDown(loading.dispose);
      var reloads = 0;
      await tester.pumpWidget(host(loading: loading, refresh: () => reloads++));
      final view = find.byType(WebViewPullToRefresh);
      for (final offset in const [
        Offset(0, 50),
        Offset(0, -160),
        Offset(180, 20),
      ]) {
        await tester.drag(view, offset);
        await tester.pumpAndSettle();
      }
      final cancelled = await tester.startGesture(tester.getCenter(view));
      await cancelled.moveBy(const Offset(0, 150));
      await cancelled.cancel();
      final mouse = await tester.startGesture(
        tester.getCenter(view),
        kind: PointerDeviceKind.mouse,
      );
      await mouse.moveBy(const Offset(0, 160));
      await mouse.up();
      await tester.pumpAndSettle();
      expect(reloads, 0);
      expect(find.byType(RefreshProgressIndicator), findsNothing);
    },
  );

  testWidgets(
    'normal scrolling and taps reach the embedded child away from the top',
    (tester) async {
      final loading = ValueNotifier(false);
      addTearDown(loading.dispose);
      var reloads = 0, taps = 0, scrolls = 0;
      await tester.pumpWidget(
        host(
          loading: loading,
          atTop: false,
          refresh: () => reloads++,
          tap: () => taps++,
          drag: (_) => scrolls++,
        ),
      );
      final view = find.byType(WebViewPullToRefresh);
      await tester.drag(view, const Offset(0, 160));
      await tester.tap(view);
      await tester.pumpAndSettle();
      expect(scrolls, greaterThan(0));
      expect(taps, 1);
      expect(reloads, 0);
    },
  );

  testWidgets('a gesture that reaches the top mid-scroll is not a refresh', (
    tester,
  ) async {
    final loading = ValueNotifier(false);
    addTearDown(loading.dispose);
    var reloads = 0;
    await tester.pumpWidget(
      host(loading: loading, atTop: false, refresh: () => reloads++),
    );
    final touch = await tester.startGesture(
      tester.getCenter(find.byType(WebViewPullToRefresh)),
    );
    await touch.moveBy(const Offset(0, 40));
    await tester.pumpWidget(host(loading: loading, refresh: () => reloads++));
    await touch.moveBy(const Offset(0, 160));
    await touch.up();
    await tester.pumpAndSettle();
    expect(reloads, 0);
  });

  testWidgets(
    'multi-touch, an open keyboard and disabled hosts never refresh',
    (tester) async {
      final loading = ValueNotifier(false);
      addTearDown(loading.dispose);
      var reloads = 0;
      await tester.pumpWidget(host(loading: loading, refresh: () => reloads++));
      final view = find.byType(WebViewPullToRefresh),
          center = tester.getCenter(find.byType(WebViewPullToRefresh));
      final first = await tester.startGesture(center, pointer: 1);
      final second = await tester.startGesture(
        center + const Offset(40, 0),
        pointer: 2,
      );
      await first.moveBy(const Offset(0, 160));
      await second.up();
      await first.up();
      await tester.pumpWidget(
        host(loading: loading, keyboardInset: 300, refresh: () => reloads++),
      );
      await tester.drag(view, const Offset(0, 160));
      await tester.pumpWidget(
        host(loading: loading, enabled: false, refresh: () => reloads++),
      );
      await tester.drag(view, const Offset(0, 160));
      await tester.pumpAndSettle();
      expect(reloads, 0);
    },
  );
}
