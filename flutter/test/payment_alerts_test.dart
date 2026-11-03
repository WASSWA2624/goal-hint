import 'package:flutter_test/flutter_test.dart';
import 'package:goal_hint/web/native_payment_alerts.dart';

void main() {
  const event = '1196cbaa-f625-4df2-b60d-46dcbd5e8b77';
  const payment = '3664b242-8027-4643-93ae-6932403866d7';
  const endpoint = '437898f2-616c-48ec-aafa-73ed2524dd93';
  final origin = Uri.parse('https://goalhint.com');

  test(
    'notification routes are constructed from validated opaque identifiers',
    () {
      final value = PaymentAlertEnvelope.parse({
        'eventId': event,
        'paymentId': payment,
        'endpointId': endpoint,
        'url': 'https://foreign.example/approve',
      });
      expect(
        value!.destination(origin).toString(),
        'https://goalhint.com/payment-review/$payment',
      );
      expect(value.toJson().keys, ['eventId', 'paymentId', 'endpointId']);
      final testAlert = PaymentAlertEnvelope.parse({
        'eventId': event,
        'paymentId': '',
        'endpointId': endpoint,
      });
      expect(testAlert!.destination(origin).path, '/admin/settings');
    },
  );

  test(
    'malformed, external and traversal payment identifiers are rejected',
    () {
      for (final id in [
        'https://foreign.example',
        '../approve',
        '$payment?action=approve',
        'invalid',
        1,
      ]) {
        expect(
          PaymentAlertEnvelope.parse({
            'eventId': event,
            'paymentId': id,
            'endpointId': endpoint,
          }),
          isNull,
        );
      }
      expect(
        PaymentAlertEnvelope.parse({'eventId': event, 'paymentId': payment}),
        isNull,
      );
      expect(PaymentAlertEnvelope.parse('untrusted'), isNull);
    },
  );
}
