import 'dart:convert';
import 'dart:io';

/// Host-file controls for the owned loopback proxy, never a production API.
class OfflineFixtureControl {
  OfflineFixtureControl.fromEnvironment()
    : control = _ownedFile(
        const String.fromEnvironment('OFFLINE_CONTROL_FILE'),
      ),
      counters = _ownedFile(const String.fromEnvironment('OFFLINE_STATS_FILE'));

  final File control;
  final File counters;

  File get state =>
      File(control.path.replaceFirst(RegExp(r'\.json$'), '-native.json'));
  File get checkpoint =>
      File(control.path.replaceFirst(RegExp(r'\.json$'), '-checkpoint.json'));

  static File _ownedFile(String path) {
    if (path.isEmpty) {
      throw ArgumentError(
        'Pass the owned fixture control and stats file paths.',
      );
    }
    final file = File(path);
    if (FileSystemEntity.typeSync(path, followLinks: false) !=
        FileSystemEntityType.file) {
      throw ArgumentError(
        'The fixture must create its normal JSON files first.',
      );
    }
    final resolved = File(file.resolveSymbolicLinksSync());
    final segments = resolved.path.replaceAll('\\', '/').split('/');
    if (!segments.any((part) => part == '.tmp' || part == '.dart_tool') ||
        !resolved.path.endsWith('.json')) {
      throw ArgumentError('Fixture files must be under owned ignored output.');
    }
    return resolved;
  }

  Future<Map> stats() => _read(counters);
  Future<Map> saved() => _read(state);
  Future<void> save(Map value) => _write(state, value);

  Future<void> configure({
    required String generation,
    String? target,
    String? mode,
    int delayMs = 12000,
    String authState = 'active',
  }) async {
    if (!['A', 'B'].contains(generation) ||
        !['active', 'expired'].contains(authState) ||
        (target == null) != (mode == null)) {
      throw ArgumentError('Invalid synthetic fixture configuration.');
    }
    await _write(control, {
      'generation': generation,
      'fault': target == null
          ? null
          : {'target': target, 'mode': mode, 'delayMs': delayMs},
      'authState': authState,
    });
  }

  Future<void> signal(String stage, Map<String, Object?> details) =>
      _write(checkpoint, {
        'stage': stage,
        'appPid': pid,
        'atMs': DateTime.now().millisecondsSinceEpoch,
        ...details,
      });

  Future<Map> _read(File file) async {
    for (var attempt = 0; attempt < 3; attempt++) {
      try {
        final source = await file.readAsString();
        if (source.length > 2 * 1024 * 1024) {
          throw StateError('Fixture metadata exceeds its bound.');
        }
        return jsonDecode(source) as Map;
      } on FormatException {
        if (attempt == 2) rethrow;
        await Future<void>.delayed(const Duration(milliseconds: 20));
      }
    }
    throw StateError('Fixture metadata is unavailable.');
  }

  Future<void> _write(File file, Map value) async {
    // Both source and destination stay in the explicit owned directory. Do not
    // delete a directory, other application data, cookies or browser profiles.
    final parent = file.parent.resolveSymbolicLinksSync();
    if (parent != control.parent.resolveSymbolicLinksSync()) {
      throw StateError('Fixture output escaped its owned directory.');
    }
    final temporary = File('${file.path}.next');
    if (await FileSystemEntity.type(temporary.path, followLinks: false) ==
        FileSystemEntityType.link) {
      throw StateError('Fixture temporary output must not be a symbolic link.');
    }
    await temporary.writeAsString('${jsonEncode(value)}\n', flush: true);
    for (var attempt = 0; attempt < 5; attempt++) {
      try {
        await temporary.rename(file.path);
        return;
      } on FileSystemException {
        if (attempt == 4) rethrow;
        await Future<void>.delayed(const Duration(milliseconds: 20));
      }
    }
  }
}
