import 'package:flutter/widgets.dart';
import 'package:goal_hint/web/web_view_adapter.dart';

class FakeWebViewAdapter extends WebViewAdapter {
  @override
  bool get ready => true;
  @override
  bool hasDocument = true;
  @override
  bool loading = false;
  @override
  bool canGoBack = false;
  @override
  String? error;
  Uri? loadedUri;
  int reloads = 0;
  int backs = 0;
  int resumes = 0;
  int suspends = 0;
  bool disposed = false;

  void finishDocument() {
    hasDocument = true;
    loading = false;
    notifyListeners();
  }

  @override
  Widget buildView() => const Text('Embedded web application');
  @override
  Future<void> initialize() async {}
  @override
  Future<void> load(Uri uri) async => loadedUri = uri;
  @override
  Future<void> reload() async {
    reloads++;
    error = null;
    notifyListeners();
  }

  @override
  Future<void> goBack() async {
    backs++;
    canGoBack = false;
    notifyListeners();
  }

  @override
  Future<void> resume() async => resumes++;
  @override
  Future<void> suspend() async => suspends++;
  @override
  void dispose() {
    disposed = true;
    super.dispose();
  }
}
