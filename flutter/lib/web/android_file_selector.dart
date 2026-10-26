import 'package:file_selector/file_selector.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';

/// Connects ordinary HTML file inputs to Android's system document picker.
/// Capture hints fall back to this picker; no camera/storage permission is added.
Future<List<String>> selectAndroidFiles(FileSelectorParams parameters) async {
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
    if (parameters.mode == FileSelectorMode.openMultiple) {
      files = await openFiles(acceptedTypeGroups: groups);
    } else {
      final file = await openFile(acceptedTypeGroups: groups);
      files = file == null ? const [] : [file];
    }
    // The endorsed Android picker copies selected content into its private
    // cache and returns that path. WebView expects URI strings, not bare paths.
    return files
        .map((file) => Uri.file(file.path, windows: false).toString())
        .toList();
  } on Exception {
    // Cancellation or an unavailable picker must resolve the native callback.
    return const [];
  }
}
