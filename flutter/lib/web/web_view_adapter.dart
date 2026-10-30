import 'package:flutter/widgets.dart';

import 'web_appearance.dart';

/// The native browser boundary. Routes, accounts and data remain in Next.js.
abstract class WebViewAdapter extends ChangeNotifier {
  bool get ready;
  bool get hasDocument => false;
  bool get loading;
  bool get canGoBack;
  String? get error;
  WebAppearance? get appearance => null;
  bool get supportsPullToRefresh => false;
  bool get atTop => false;

  Widget buildView();
  Future<void> initialize();
  Future<void> load(Uri uri);
  Future<void> reload();
  Future<void> goBack();

  /// Reconcile browser state without reloading or discarding an unfinished form.
  Future<void> resume();

  /// Hide/pause the browser and commit its store where supported by the host.
  Future<void> suspend() async {}
}
