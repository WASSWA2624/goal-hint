import 'package:flutter_test/flutter_test.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:goal_hint/web/web_view_failure.dart';

void main() {
  final current = Uri.parse('https://goalhint.com/en/matches/current');
  WebResourceError error({
    bool? main = true,
    String? url,
    int code = -1,
    WebResourceErrorType? type,
  }) => WebResourceError(
    errorCode: code,
    description: 'native private URL and error text',
    isForMainFrame: main,
    url: url,
    errorType: type,
  );

  test('only the failing current main document replaces the application', () {
    expect(
      documentFailure(
        error(url: 'https://goalhint.com/'),
        Uri.parse('https://goalhint.com'),
      ),
      WebViewFailure.connection,
    );
    expect(documentFailure(error(url: ''), current), WebViewFailure.connection);
    expect(
      documentFailure(error(url: current.toString()), current),
      WebViewFailure.connection,
    );
    expect(
      documentFailure(error(main: false, url: current.toString()), current),
      isNull,
    );
    expect(
      documentFailure(error(url: 'https://goalhint.com/old'), current),
      isNull,
    );
    expect(
      documentFailure(error(url: 'https://external.test/'), current),
      isNull,
    );
    expect(documentFailure(error(main: null), current), isNull);
    expect(
      documentFailure(error(main: null, url: current.toString()), current),
      WebViewFailure.connection,
    );
    expect(
      documentFailure(error(url: '$current#score'), current),
      WebViewFailure.connection,
    );
  });

  test(
    'Android aborted connections and unknown engine errors use safe guidance',
    () {
      expect(
        documentFailure(error(code: -103, url: current.toString()), current),
        WebViewFailure.connection,
      );
      expect(
        documentFailure(error(type: WebResourceErrorType.timeout), current),
        WebViewFailure.timeout,
      );
      expect(
        documentFailure(
          error(type: WebResourceErrorType.failedSslHandshake),
          current,
        ),
        WebViewFailure.secureConnection,
      );
      expect(
        documentFailure(
          error(type: WebResourceErrorType.webContentProcessTerminated),
          current,
        ),
        WebViewFailure.browser,
      );
    },
  );

  test(
    'WK cancellations are ignored and URL error codes distinguish recovery',
    () {
      expect(documentFailure(error(code: -999), current, webKit: true), isNull);
      expect(
        documentFailure(error(code: -1001), current, webKit: true),
        WebViewFailure.timeout,
      );
      for (final code in [
        -1022,
        -1200,
        -1201,
        -1202,
        -1203,
        -1204,
        -1205,
        -1206,
      ]) {
        expect(
          documentFailure(error(code: code), current, webKit: true),
          WebViewFailure.secureConnection,
        );
      }
      expect(
        documentFailure(error(code: -1009), current, webKit: true),
        WebViewFailure.connection,
      );
    },
  );
}
