import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:path/path.dart' as path;

/// Test-only, file-controlled manual checkpoints outside the web document.
class OperatorControl {
  OperatorControl({
    required String source,
    required String fixturePrefix,
    required String marker,
  }) : file = _ownedFile(source, fixturePrefix, marker);

  final File file;

  static File _ownedFile(String source, String prefix, String marker) {
    if (FileSystemEntity.typeSync(source, followLinks: false) !=
        FileSystemEntityType.file) {
      throw ArgumentError('Create the owned UTF-8 JSON control file first.');
    }
    final file = File(File(source).resolveSymbolicLinksSync());
    final parent = file.parent;
    final markerFile = File(path.join(parent.path, marker));
    if (!path.split(parent.path).contains('.tmp') ||
        !path.basename(parent.path).startsWith(prefix) ||
        !file.path.endsWith('.json') ||
        FileSystemEntity.typeSync(markerFile.path, followLinks: false) !=
            FileSystemEntityType.file ||
        markerFile.readAsStringSync().trim() != '1') {
      throw ArgumentError('Control must belong to the marked .tmp fixture.');
    }
    return file;
  }

  Future<Map> read() async {
    for (var attempt = 0; attempt < 3; attempt++) {
      try {
        final source = await file.readAsString();
        if (source.length > 8192) {
          throw StateError('Control exceeds its bound.');
        }
        return jsonDecode(source) as Map;
      } on FormatException {
        if (attempt == 2) rethrow;
        await Future<void>.delayed(const Duration(milliseconds: 20));
      }
    }
    throw StateError('Control unavailable.');
  }

  Future<void> write(String kind, Map value) async {
    if (!RegExp(r'^[a-z-]{1,32}$').hasMatch(kind)) {
      throw ArgumentError('Invalid fixture output kind.');
    }
    final destination = File(
      file.path.replaceFirst(RegExp(r'\.json$'), '-$kind.json'),
    );
    final temporary = File('${destination.path}.next');
    for (final output in [temporary, destination]) {
      if (await FileSystemEntity.type(output.path, followLinks: false) ==
          FileSystemEntityType.link) {
        throw StateError('Fixture output cannot follow a symbolic link.');
      }
    }
    await temporary.writeAsString('${jsonEncode(value)}\n', flush: true);
    for (var attempt = 0; attempt < 5; attempt++) {
      try {
        await temporary.rename(destination.path);
        return;
      } on FileSystemException {
        if (attempt == 4) rethrow;
        await Future<void>.delayed(const Duration(milliseconds: 20));
      }
    }
  }

  Future<Map> checkpoint(
    WidgetTester tester,
    String stage,
    Map details, {
    Future<Map> Function()? observe,
    Duration timeout = const Duration(minutes: 10),
  }) async {
    await write('checkpoint', {
      'stage': stage,
      'appPid': pid,
      'atMs': DateTime.now().millisecondsSinceEpoch,
      ...details,
    });
    String? observed;
    final deadline = DateTime.now().add(timeout);
    while (DateTime.now().isBefore(deadline)) {
      final control = await read();
      if (control['advance'] == stage) return control;
      final request = control['observe'];
      if (observe != null &&
          request is String &&
          request.isNotEmpty &&
          request.length <= 128 &&
          request != observed) {
        observed = request;
        await write('observation', {
          'stage': stage,
          'request': request,
          'appPid': pid,
          ...await observe(),
        });
      }
      await tester.pump(const Duration(milliseconds: 200));
    }
    fail('Native UI operator checkpoint expired: $stage');
  }
}
