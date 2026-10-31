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
