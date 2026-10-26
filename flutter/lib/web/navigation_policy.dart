enum NavigationAction { allow, external, block }

/// Only the configured origin may own a document inside the native shell.
class NavigationPolicy {
  NavigationPolicy(Uri origin) : _origin = origin.origin;

  final String _origin;
  static final _invalidCharacters = RegExp(r'[\s\\\x00-\x1f\x7f]');

  NavigationAction evaluate(String address) {
    if (address.isEmpty || _invalidCharacters.hasMatch(address)) {
      return NavigationAction.block;
    }
    final uri = Uri.tryParse(address);
    if (uri == null) return NavigationAction.block;
    if (uri.scheme == 'mailto' || uri.scheme == 'tel') {
      return uri.path.isNotEmpty
          ? NavigationAction.external
          : NavigationAction.block;
    }
    final authority = RegExp(
      r'^[a-zA-Z][a-zA-Z0-9+.-]*://([^/?#]*)',
    ).firstMatch(address)?.group(1);
    if ((uri.scheme != 'http' && uri.scheme != 'https') ||
        !uri.hasAuthority ||
        uri.host.isEmpty ||
        uri.userInfo.isNotEmpty ||
        authority == null ||
        authority.contains('@') ||
        authority.endsWith(':')) {
      return NavigationAction.block;
    }
    try {
      if (uri.port < 1 || uri.port > 65535) return NavigationAction.block;
      final host = Uri.decodeComponent(uri.host);
      if (_invalidCharacters.hasMatch(host) ||
          RegExp(r'[/\\?#@]').hasMatch(host)) {
        return NavigationAction.block;
      }
      return uri.origin == _origin
          ? NavigationAction.allow
          : NavigationAction.external;
    } on FormatException {
      return NavigationAction.block;
    }
  }
}
