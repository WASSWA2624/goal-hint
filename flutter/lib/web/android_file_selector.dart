import 'package:file_selector/file_selector.dart';
import 'package:image_picker/image_picker.dart' as camera;
import 'package:webview_flutter_android/webview_flutter_android.dart';

typedef AndroidDocumentPicker =
    Future<List<XFile>> Function({
      required bool multiple,
      required List<XTypeGroup> acceptedTypeGroups,
    });

/// Honors explicit still-image capture while ordinary uploads keep Android's
/// document picker. Images continue through the shared web validation flow.
Future<List<String>> selectAndroidFiles(
  FileSelectorParams parameters, {
  Future<XFile?> Function()? capturePhoto,
  AndroidDocumentPicker? chooseDocuments,
}) async {
  if (parameters.mode == FileSelectorMode.save) return const [];
  final types = parameters.acceptTypes
      .expand((value) => value.split(','))
      .map((value) => value.trim().toLowerCase())
      .where((value) => value.isNotEmpty)
      .toSet();
  final extensions = types
      .where((value) => value.startsWith('.') && value.length > 1)
      .map((value) => value.substring(1))
      .toList();
  final mimeTypes = types.where((value) => value.contains('/')).toList();
  final groups =
      types.contains('*/*') || (extensions.isEmpty && mimeTypes.isEmpty)
      ? const <XTypeGroup>[]
      : [
          XTypeGroup(
            label: 'Accepted files',
            extensions: extensions.isEmpty ? null : extensions,
            mimeTypes: mimeTypes.isEmpty ? null : mimeTypes,
          ),
        ];
  try {
    final List<XFile> files;
    final imageCapture =
        parameters.isCaptureEnabled &&
        parameters.mode == FileSelectorMode.open &&
        types.isNotEmpty &&
        types.every(
          (type) =>
              type.startsWith('image/') ||
              const {
                '.jpg',
                '.jpeg',
                '.png',
                '.webp',
                '.heic',
                '.heif',
                '.bmp',
                '.gif',
              }.contains(type),
        );
    if (imageCapture) {
      final image = await (capturePhoto ?? _capturePhoto)();
      files = image == null ? const [] : [image];
    } else {
      files = await (chooseDocuments ?? _chooseDocuments)(
        multiple: parameters.mode == FileSelectorMode.openMultiple,
        acceptedTypeGroups: groups,
      );
    }
    // Both endorsed pickers return a private cache path. WebView expects URIs.
    return files
        .map((file) => Uri.file(file.path, windows: false).toString())
        .toList();
  } on Exception {
    // Cancellation, denied access or an unavailable camera/picker must resolve
    // the native callback without replacing the web application's current image.
    return const [];
  }
}

Future<XFile?> _capturePhoto() => camera.ImagePicker().pickImage(
  source: camera.ImageSource.camera,
  preferredCameraDevice: camera.CameraDevice.rear,
  requestFullMetadata: false,
);

Future<List<XFile>> _chooseDocuments({
  required bool multiple,
  required List<XTypeGroup> acceptedTypeGroups,
}) async {
  if (multiple) return openFiles(acceptedTypeGroups: acceptedTypeGroups);
  final file = await openFile(acceptedTypeGroups: acceptedTypeGroups);
  return file == null ? const [] : [file];
}
