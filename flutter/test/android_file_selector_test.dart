import 'package:file_selector/file_selector.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:goal_hint/web/android_file_selector.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';

void main() {
  FileSelectorParams parameters({
    bool capture = false,
    List<String> types = const ['image/*'],
    FileSelectorMode mode = FileSelectorMode.open,
  }) => FileSelectorParams(
    isCaptureEnabled: capture,
    acceptTypes: types,
    mode: mode,
  );

  test(
    'explicit image capture opens the camera and returns an encoded file URI',
    () async {
      var captured = false;
      final result = await selectAndroidFiles(
        parameters(capture: true, types: [' IMAGE/*, .JPG ']),
        capturePhoto: () async {
          captured = true;
          return XFile('/private/cache/payment photo.jpg');
        },
        chooseDocuments:
            ({required multiple, required acceptedTypeGroups}) async {
              fail('Capture must not open the document picker.');
            },
      );
      expect(captured, isTrue);
      expect(result, ['file:///private/cache/payment%20photo.jpg']);
    },
  );

  test(
    'ordinary image uploads keep the document picker and accepted types',
    () async {
      final result = await selectAndroidFiles(
        parameters(types: ['image/png, .JPG', 'image/jpeg']),
        capturePhoto: () async => fail('Browse must not launch the camera.'),
        chooseDocuments:
            ({required multiple, required acceptedTypeGroups}) async {
              expect(multiple, isFalse);
              expect(acceptedTypeGroups.single.extensions, ['jpg']);
              expect(acceptedTypeGroups.single.mimeTypes, [
                'image/png',
                'image/jpeg',
              ]);
              return [XFile('/private/cache/selected.png')];
            },
      );
      expect(result, ['file:///private/cache/selected.png']);
    },
  );

  test(
    'multiple, mixed media, empty and non-image capture requests stay in browse',
    () async {
      for (final request in [
        parameters(capture: true, mode: FileSelectorMode.openMultiple),
        parameters(capture: true, types: ['image/*', 'video/*']),
        parameters(capture: true, types: []),
        parameters(capture: true, types: ['application/pdf']),
        parameters(capture: true, types: ['*/*']),
      ]) {
        final result = await selectAndroidFiles(
          request,
          capturePhoto: () async =>
              fail('Only explicit still-image capture is supported.'),
          chooseDocuments:
              ({required multiple, required acceptedTypeGroups}) async {
                expect(multiple, request.mode == FileSelectorMode.openMultiple);
                if (request.acceptTypes.isEmpty ||
                    request.acceptTypes.contains('*/*')) {
                  expect(acceptedTypeGroups, isEmpty);
                }
                return [
                  XFile('/private/cache/first'),
                  if (multiple) XFile('/private/cache/second'),
                ];
              },
        );
        expect(
          result.length,
          request.mode == FileSelectorMode.openMultiple ? 2 : 1,
        );
      }
    },
  );

  test(
    'camera cancellation and failures resolve empty without opening browse',
    () async {
      for (final error in [
        null,
        PlatformException(code: 'camera_access_denied'),
        MissingPluginException(),
      ]) {
        final result = await selectAndroidFiles(
          parameters(capture: true),
          capturePhoto: () async {
            if (error != null) throw error;
            return null;
          },
          chooseDocuments:
              ({required multiple, required acceptedTypeGroups}) async {
                fail('A cancelled camera must not open another picker.');
              },
        );
        expect(result, isEmpty);
      }
    },
  );

  test(
    'document cancellation and failures also resolve the callback',
    () async {
      for (final error in [
        null,
        PlatformException(code: 'picker_unavailable'),
      ]) {
        final result = await selectAndroidFiles(
          parameters(),
          capturePhoto: () async => fail('Browse must not launch the camera.'),
          chooseDocuments:
              ({required multiple, required acceptedTypeGroups}) async {
                if (error != null) throw error;
                return [];
              },
        );
        expect(result, isEmpty);
      }
    },
  );

  test('save requests do not open an upload or camera activity', () async {
    expect(
      await selectAndroidFiles(
        parameters(capture: true, mode: FileSelectorMode.save),
        capturePhoto: () async => fail('Save is not capture.'),
        chooseDocuments:
            ({required multiple, required acceptedTypeGroups}) async {
              fail('Save is not an upload.');
            },
      ),
      isEmpty,
    );
  });
}
