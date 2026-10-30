import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import '../config/app_branding.dart';

/// Observes a top-of-document touch pull without competing with the WebView's
/// own scrolling, links, horizontal gestures or pinch zoom.
class WebViewPullToRefresh extends StatefulWidget {
  const WebViewPullToRefresh({
    super.key,
    required this.enabled,
    required this.atTop,
    required this.loading,
    required this.onRefresh,
    required this.child,
    this.color,
    this.backgroundColor,
  });

  final bool enabled;
  final bool atTop;
  final bool loading;
  final VoidCallback onRefresh;
  final Widget child;
  final Color? color;
  final Color? backgroundColor;

  @override
  State<WebViewPullToRefresh> createState() => _WebViewPullToRefreshState();
}

class _WebViewPullToRefreshState extends State<WebViewPullToRefresh> {
  static const _triggerDistance = 96.0;
  final _pointers = <int>{};
  int? _pointer;
  Offset? _origin;
  double _distance = 0;
  bool _refreshing = false;

  bool get _allowed =>
      widget.enabled &&
      widget.atTop &&
      !widget.loading &&
      !_refreshing &&
      MediaQuery.viewInsetsOf(context).bottom == 0;

  @override
  void didUpdateWidget(WebViewPullToRefresh oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!widget.enabled || !widget.loading) _refreshing = false;
    if (!widget.enabled || !widget.atTop || widget.loading) {
      _pointer = null;
      _origin = null;
      _distance = 0;
    }
    if (!widget.enabled) _pointers.clear();
  }

  void _down(PointerDownEvent event) {
    if (event.kind != PointerDeviceKind.touch) return;
    _pointers.add(event.pointer);
    if (_pointers.length != 1) {
      _cancelPull();
    } else if (_allowed) {
      _pointer = event.pointer;
      _origin = event.localPosition;
    }
  }

  void _move(PointerMoveEvent event) {
    if (_pointer != event.pointer || _origin == null) return;
    final delta = event.localPosition - _origin!;
    if (!_allowed ||
        delta.dy < -kTouchSlop ||
        delta.dx.abs() > kTouchSlop && delta.dx.abs() > delta.dy) {
      _cancelPull();
      return;
    }
    final distance = delta.dy.clamp(0.0, _triggerDistance * 1.5).toDouble();
    if (_distance != distance) setState(() => _distance = distance);
  }

  void _up(PointerUpEvent event) {
    _pointers.remove(event.pointer);
    if (_pointer != event.pointer) return;
    final delta = event.localPosition - _origin!;
    final refresh =
        _allowed &&
        _distance >= _triggerDistance &&
        delta.dy > delta.dx.abs() * 1.5;
    setState(() {
      _pointer = null;
      _origin = null;
      _distance = 0;
      _refreshing = refresh;
    });
    // The adapter publishes loading before this callback returns, then clears it
    // when the document finishes, fails, or its navigation is cancelled.
    if (refresh) widget.onRefresh();
  }

  void _cancel(PointerCancelEvent event) {
    _pointers.remove(event.pointer);
    if (_pointer == event.pointer) _cancelPull();
  }

  void _cancelPull() {
    _pointer = null;
    _origin = null;
    if (_distance != 0) setState(() => _distance = 0);
  }

  @override
  Widget build(BuildContext context) {
    final progress = (_distance / _triggerDistance).clamp(0.0, 1.0);
    final show = _refreshing || _distance > kTouchSlop;
    return Stack(
      fit: StackFit.expand,
      children: [
        Listener(
          behavior: HitTestBehavior.translucent,
          onPointerDown: _down,
          onPointerMove: _move,
          onPointerUp: _up,
          onPointerCancel: _cancel,
          child: widget.child,
        ),
        if (show)
          Positioned(
            top: _refreshing ? 16 : (_distance * 0.35).clamp(4.0, 40.0),
            left: 0,
            right: 0,
            child: IgnorePointer(
              child: Center(
                child: RefreshProgressIndicator(
                  value: _refreshing
                      ? MediaQuery.disableAnimationsOf(context)
                            ? 1
                            : null
                      : progress,
                  color: widget.color,
                  backgroundColor: widget.backgroundColor,
                  semanticsLabel: _refreshing
                      ? 'Refreshing ${AppBrandingScope.of(context).name}'
                      : 'Pull to refresh',
                ),
              ),
            ),
          ),
      ],
    );
  }
}
