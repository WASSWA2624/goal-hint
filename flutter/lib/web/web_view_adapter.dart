import 'package:flutter/widgets.dart';

/// The native browser boundary. Routes, accounts and data remain in Next.js.
abstract class WebViewAdapter extends ChangeNotifier {
  bool get ready;
  bool get hasDocument => false;
  bool get loading;
  bool get canGoBack;
  String? get error;

  Widget buildView();
  Future<void> initialize();
  Future<void> load(Uri uri);
  Future<void> reload();
  Future<void> goBack();

  /// Reconcile browser state without reloading or discarding an unfinished form.
  Future<void> resume();

  /// Commit browser-managed storage before normal background/close where needed.
  Future<void> suspend() async {}
}
