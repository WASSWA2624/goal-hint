import 'package:webview_flutter/webview_flutter.dart';

/// Safe recovery categories. Native URLs and engine descriptions stay private.
enum WebViewFailure {
  connection,
  timeout,
  unavailable,
  secureConnection,
  browser;

  String title(String appName) => switch (this) {
    connection => 'Connection interrupted',
    timeout => 'Taking too long to connect',
    unavailable => 'We’ll be back shortly',
    secureConnection => 'Unable to connect securely',
    browser => 'Let’s get $appName open',
  };

  String message(String appName) => switch (this) {
    connection =>
      'We couldn’t reach $appName. Check your internet connection, then try again.',
    timeout =>
      '$appName took too long to respond. Your connection may be slow, or the service may be busy.',
    unavailable =>
      '$appName is temporarily unavailable. Please try again in a few moments.',
    secureConnection =>
      'We couldn’t establish a secure connection to $appName. Your connection has been kept protected.',
    browser =>
      'The app’s browser couldn’t start or stopped responding. Please try again.',
  };
}

/// Only failures of the current document replace the web application.
/// A missing frame flag is accepted only when its URL identifies that document.
WebViewFailure? documentFailure(
  WebResourceError error,
  Uri currentUri, {
  bool webKit = false,
}) {
  if (error.isForMainFrame == false || webKit && error.errorCode == -999) {
    return null;
  }
  final address = error.url == null || error.url!.isEmpty
      ? null
      : Uri.tryParse(error.url!);
  if (address != null && !sameWebDocument(address, currentUri)) return null;
  if (error.isForMainFrame != true && address == null) return null;
  // WK exposes NSURLError codes without mapping them to WebResourceErrorType.
  if (webKit) {
    if (error.errorCode == -1001) return WebViewFailure.timeout;
    if (error.errorCode == -1022 ||
        error.errorCode <= -1200 && error.errorCode >= -1206) {
      return WebViewFailure.secureConnection;
    }
  }
  return switch (error.errorType) {
    WebResourceErrorType.timeout => WebViewFailure.timeout,
    WebResourceErrorType.failedSslHandshake ||
    WebResourceErrorType.unsafeResource => WebViewFailure.secureConnection,
    WebResourceErrorType.webContentProcessTerminated ||
    WebResourceErrorType.webViewInvalidated => WebViewFailure.browser,
    _ => WebViewFailure.connection,
  };
}

bool sameWebDocument(Uri first, Uri second) {
  Uri normalized(Uri value) =>
      value.replace(path: value.path.isEmpty ? '/' : value.path, fragment: '');
  return normalized(first) == normalized(second);
}
