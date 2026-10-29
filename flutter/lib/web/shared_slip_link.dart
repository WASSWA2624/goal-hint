import 'navigation_policy.dart';

/// Resolve only public slip links into this build's configured web origin.
/// Native navigation never accepts another host, encoded path, or credentials.
Uri? sharedSlipLink(String address, Uri origin) {
  if (address.contains('%') ||
      RegExp(r'[\s\\\x00-\x1f\x7f]').hasMatch(address)) {
    return null;
  }
  final uri = Uri.tryParse(address);
  if (uri == null ||
      uri.userInfo.isNotEmpty ||
      uri.hasQuery ||
      uri.hasFragment ||
      !RegExp(r'^/s/[a-f0-9]{32}$').hasMatch(uri.path)) {
    return null;
  }
  try {
    if (uri.hasScheme || uri.hasAuthority) {
      if (NavigationPolicy(origin).evaluate(address) !=
          NavigationAction.allow) {
        return null;
      }
    } else if (!address.startsWith('/s/')) {
      return null;
    }
    return origin.resolve(uri.path);
  } on FormatException {
    return null;
  }
}
