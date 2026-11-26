enum NavigationAction { allow, external, block }

/// Only the configured origin may own a document inside the native shell.
class NavigationPolicy {
  NavigationPolicy(Uri origin) : _origin = origin.origin;

  final String _origin;
  static final _invalidCharacters = RegExp(r'[\s\\\x00-\x1f\x7f]');
  static final _phone = RegExp(r'^[1-9][0-9]{9,14}$');

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
    try {
      if (uri.scheme == 'sms' || uri.scheme == 'whatsapp') {
        return _isMessageLink(uri)
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
      if (uri.port < 1 || uri.port > 65535) return NavigationAction.block;
      final host = Uri.decodeComponent(uri.host);
      if (_invalidCharacters.hasMatch(host) ||
          RegExp(r'[/\\?#@]').hasMatch(host)) {
        return NavigationAction.block;
      }
      if (uri.origin == _origin &&
          const {
            '/api/downloads/android',
            '/api/downloads/windows',
            '/api/downloads/macos',
            '/api/downloads/linux',
          }.contains(uri.path)) {
        return NavigationAction.external;
      }
      return uri.origin == _origin
          ? NavigationAction.allow
          : NavigationAction.external;
    } on FormatException {
      return NavigationAction.block;
    }
  }

  static bool _isMessageLink(Uri uri) {
    if (uri.hasFragment) return false;
    final fields = uri.queryParametersAll;
    if (uri.scheme == 'sms') {
      final recipient = uri.path;
      return !uri.hasAuthority &&
          recipient.startsWith('+') &&
          _phone.hasMatch(recipient.substring(1)) &&
          (!uri.hasQuery || (fields.length == 1 && _isDraft(fields['body'])));
    }
    final recipient = fields['phone'];
    return uri.authority == 'send' &&
        uri.path.isEmpty &&
        fields.length == 2 &&
        recipient != null &&
        recipient.length == 1 &&
        _phone.hasMatch(recipient.single) &&
        _isDraft(fields['text']);
  }

  static bool _isDraft(List<String>? values) =>
      values != null && values.length == 1 && values.single.isNotEmpty;
}
