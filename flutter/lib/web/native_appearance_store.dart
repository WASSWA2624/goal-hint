import 'dart:convert';
import 'dart:io';

import 'package:path_provider/path_provider.dart';

import 'web_appearance.dart';

/// A bounded mirror of public presentation only; no cookies, URLs or accounts.
class NativeAppearanceSnapshot {
  const NativeAppearanceSnapshot({
    this.appearance,
    this.preference,
    this.pending = false,
  });
  final WebAppearance? appearance;
  final WebThemePreference? preference;
  final bool pending;

  static NativeAppearanceSnapshot? parse(String source) {
    if (source.length > 2048) return null;
    try {
      final value = jsonDecode(source);
      if (value is! Map ||
          value.length != 4 ||
          value['version'] != 1 ||
          value.keys.any(
            (key) => !const {
              'version',
              'appearance',
              'preference',
              'pending',
            }.contains(key),
          ) ||
          value['pending'] is! bool) {
        return null;
      }
      final preference = value['preference'];
      if (preference != null &&
          !WebThemePreference.values.any((mode) => mode.name == preference)) {
        return null;
      }
      final appearance = WebAppearance.parse(value['appearance']);
      if (value['appearance'] != null && appearance == null) return null;
      if (value['pending'] == true && preference == null) return null;
      return NativeAppearanceSnapshot(
        appearance: appearance,
        preference: preference == null
            ? null
            : WebThemePreference.values.byName(preference as String),
        pending: value['pending'] as bool,
      );
    } on FormatException {
      return null;
    }
  }

  String encode() => jsonEncode({
    'version': 1,
    'appearance': appearance?.toJson(),
    'preference': preference?.name,
    'pending': pending,
  });
}

class NativeAppearanceStore {
  NativeAppearanceStore(this.file);
  final File file;
  Future<void> _writes = Future.value();

  static Future<NativeAppearanceStore> forOrigin(Uri origin) async {
    final support = await getApplicationSupportDirectory();
    final name = base64Url
        .encode(utf8.encode(origin.origin))
        .replaceAll('=', '');
    return NativeAppearanceStore(
      File('${support.path}/native-appearance/$name.json'),
    );
  }

  Future<NativeAppearanceSnapshot?> read() async {
    try {
      if (await file.length() > 2048) return null;
      return NativeAppearanceSnapshot.parse(await file.readAsString());
    } on FileSystemException {
      return null;
    }
  }

  Future<void> save(NativeAppearanceSnapshot snapshot) {
    _writes = _writes.then((_) async {
      try {
        await file.parent.create(recursive: true);
        final temporary = File('${file.path}.tmp');
        await temporary.writeAsString(snapshot.encode(), flush: true);
        await temporary.rename(file.path);
      } on FileSystemException {
        /* Presentation persistence cannot block the app. */
      }
    });
    return _writes;
  }
}
