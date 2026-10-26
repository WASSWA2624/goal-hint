import 'dart:async';
import 'dart:convert';
import 'dart:ui';

/// Public web colors only. Account state and theme preference stay in the page.
class WebAppearance {
  const WebAppearance({
    required this.brightness,
    required this.background,
    required this.surface,
    required this.foreground,
    required this.accent,
    required this.chrome,
  });

  final Brightness brightness;
  final Color background;
  final Color surface;
  final Color foreground;
  final Color accent;
  final Color chrome;

  static const _fields = {
    'version',
    'scheme',
    'background',
    'surface',
    'foreground',
    'accent',
    'chrome',
  };
  static final _hex = RegExp(r'^#[0-9a-fA-F]{6}$');

  /// Android/WK may return a JSON string while other engines return its value.
  static WebAppearance? parse(Object? value) {
    var decoded = value;
    try {
      for (var count = 0; count < 2 && decoded is String; count++) {
        if (decoded.length > 1024) return null;
        decoded = jsonDecode(decoded);
      }
    } on FormatException {
      return null;
    }
    if (decoded is! Map ||
        decoded.length != _fields.length ||
        decoded.keys.any((key) => !_fields.contains(key)) ||
        decoded['version'] is! int ||
        decoded['version'] != 1 ||
        !const ['light', 'dark'].contains(decoded['scheme'])) {
      return null;
    }
    for (final key in _fields.difference({'version', 'scheme'})) {
      final color = decoded[key];
      if (color is! String || !_hex.hasMatch(color)) return null;
    }
    Color color(String key) => Color(
      0xFF000000 | int.parse((decoded as Map)[key].substring(1), radix: 16),
    );
    return WebAppearance(
      brightness: decoded['scheme'] == 'dark'
          ? Brightness.dark
          : Brightness.light,
      background: color('background'),
      surface: color('surface'),
      foreground: color('foreground'),
      accent: color('accent'),
      chrome: color('chrome'),
    );
  }

  @override
  bool operator ==(Object other) =>
      other is WebAppearance &&
      brightness == other.brightness &&
      background == other.background &&
      surface == other.surface &&
      foreground == other.foreground &&
      accent == other.accent &&
      chrome == other.chrome;

  @override
  int get hashCode =>
      Object.hash(brightness, background, surface, foreground, accent, chrome);
}

/// Fixed read-only query: no page-created native channel or arbitrary commands.
String webAppearanceQuery(Uri origin) =>
    '''
(() => {
  try {
    if (window.top !== window || location.origin !== ${jsonEncode(origin.origin)}) return null;
    const content = document.querySelector('meta[name="goal-hint-appearance"]')?.content;
    return typeof content === 'string' && content.length <= 1024 ? content : null;
  } catch { return null; }
})()
''';

/// One lightweight foreground read at a time; no network or native preference.
class WebAppearanceSampler {
  WebAppearanceSampler({
    required this.read,
    required this.onChanged,
    this.interval = const Duration(seconds: 1),
  });

  final Future<Object?> Function() read;
  final void Function(WebAppearance) onChanged;
  final Duration interval;
  Timer? _timer;
  bool _active = false;
  bool _reading = false;
  bool _disposed = false;
  int _generation = 0;
  WebAppearance? _appearance;

  void setActive(bool active) {
    if (_disposed || active == _active) return;
    _active = active;
    ++_generation;
    _timer?.cancel();
    _timer = null;
    if (active) refresh();
  }

  void refresh() {
    if (!_active || _reading || _disposed) return;
    _timer?.cancel();
    _timer = null;
    unawaited(_sample());
  }

  Future<void> _sample() async {
    _reading = true;
    final generation = _generation;
    try {
      final value = WebAppearance.parse(await read());
      if (!_disposed &&
          _active &&
          generation == _generation &&
          value != null &&
          value != _appearance) {
        _appearance = value;
        onChanged(value);
      }
    } catch (_) {
      // A replaced, suspended or closed document is not a native load failure.
    } finally {
      _reading = false;
      if (!_disposed && _active) {
        if (generation != _generation) {
          refresh();
        } else {
          _timer = Timer(interval, refresh);
        }
      }
    }
  }

  void dispose() {
    _disposed = true;
    ++_generation;
    _timer?.cancel();
    _timer = null;
  }
}
