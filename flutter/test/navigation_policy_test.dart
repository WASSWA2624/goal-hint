import 'package:flutter_test/flutter_test.dart';
import 'package:goal_hint/web/navigation_policy.dart';

void main() {
  final production = NavigationPolicy(Uri.parse('https://goalhint.com'));

  test(
    'app routes, query parameters and fragments retain the configured origin',
    () {
      for (final address in [
        'https://goalhint.com/en',
        'https://goalhint.com:443/en/login?next=%2Fen%2Faccount#phone',
        'https://goalhint.com/en/matches/42?market=goals&day=tomorrow',
      ]) {
        expect(production.evaluate(address), NavigationAction.allow);
      }
    },
  );

  test('development trust includes the exact scheme, host and port', () {
    final development = NavigationPolicy(Uri.parse('http://10.0.2.2:3000'));
    expect(
      development.evaluate('http://10.0.2.2:3000/en'),
      NavigationAction.allow,
    );
    expect(
      development.evaluate('http://10.0.2.2:3001/en'),
      NavigationAction.external,
    );
    expect(
      development.evaluate('https://10.0.2.2:3000/en'),
      NavigationAction.external,
    );
  });

  test('installer links leave the webview without replacing its document', () {
    for (final platform in ['android', 'windows', 'macos', 'linux']) {
      expect(
        production.evaluate(
          'https://goalhint.com/api/downloads/$platform?version=1.2.3&build=7',
        ),
        NavigationAction.external,
      );
    }
    expect(
      production.evaluate('https://goalhint.com/api/downloads'),
      NavigationAction.allow,
    );
    expect(
      production.evaluate('https://goalhint.com/en/download'),
      NavigationAction.allow,
    );
  });

  test(
    'outside destinations use native handlers instead of gaining app trust',
    () {
      for (final address in [
        'https://example.com/help?from=goalhint',
        'https://wa.me/?text=Join%20me%20on%20Goal%20Hint',
        'https://t.me/share/url?url=https%3A%2F%2Fgoalhint.com%2Fr%2Faaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        'https://goalhint.com.example.com/en',
        'https://other.goalhint.com/en',
        'http://goalhint.com/en',
        'mailto:support@example.com?subject=Help',
        'tel:+256700000000',
      ]) {
        expect(production.evaluate(address), NavigationAction.external);
      }
    },
  );

  test('SMS and WhatsApp drafts open in the external messaging app', () {
    const draft =
        'Please%20open%20https%3A%2F%2Fgoalhint.com%2Freset%23example';
    for (final address in [
      'sms:+256700000000',
      'sms:+256700000000?body=$draft',
      'sms:+256700000000?&body=$draft',
      'whatsapp://send?phone=256700000000&text=$draft',
    ]) {
      expect(production.evaluate(address), NavigationAction.external);
    }
  });

  test('malformed messaging links cannot trigger an external app', () {
    for (final address in [
      'sms:',
      'sms:1234',
      'sms:+256700000000,+256711111111?body=Hello',
      'sms://+256700000000?body=Hello',
      'sms:+256700000000?body=Hello&body=Again',
      'sms:+256700000000?body=Hello&to=1234',
      'sms:+256700000000?body=%FF',
      'whatsapp://settings?phone=256700000000&text=Hello',
      'whatsapp://send/path?phone=256700000000&text=Hello',
      'whatsapp://account@send?phone=256700000000&text=Hello',
      'whatsapp://send:33?phone=256700000000&text=Hello',
      'whatsapp://send?phone=256700000000&text=Hello#fragment',
      'whatsapp://send?phone=256700000000&phone=1234&text=Hello',
      'whatsapp://send?phone=256700000000&text=',
      'whatsapp://send?phone=256700000000&text=%FF',
    ]) {
      expect(
        production.evaluate(address),
        NavigationAction.block,
        reason: address,
      );
    }
  });

  test(
    'unsafe schemes and malformed or credential-bearing addresses fail closed',
    () {
      for (final address in [
        '',
        '/en/account',
        '//goalhint.com/en',
        'javascript:alert(document.cookie)',
        'data:text/html,<h1>untrusted</h1>',
        'file:///etc/passwd',
        'intent://account',
        'about:blank',
        'https://user:password@goalhint.com/en',
        'https://@goalhint.com/en',
        'https://goalhint.com\\@example.com/en',
        'https://goalhint.com/%0a\n',
        'https://goalhint.com:0/en',
        'https://goalhint.com:65536/en',
        'https://goalhint%2f.example.com/en',
        'mailto:',
        'tel:',
      ]) {
        expect(
          production.evaluate(address),
          NavigationAction.block,
          reason: address,
        );
      }
    },
  );
}
