import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:goal_hint/web/native_appearance_store.dart';
import 'package:goal_hint/web/web_appearance.dart';

void main() {
  test(
    'appearance mirror survives restart, orders writes and rejects expanded data',
    () async {
      final directory = await Directory.systemTemp.createTemp(
        'goal-hint-appearance-',
      );
      final file = File('${directory.path}/appearance.json');
      addTearDown(() async {
        if (await file.exists()) await file.delete();
        final temporary = File('${file.path}.tmp');
        if (await temporary.exists()) await temporary.delete();
        await directory.delete();
      });
      final store = NativeAppearanceStore(file);
      expect(await store.read(), isNull);
      final first = store.save(
        const NativeAppearanceSnapshot(
          preference: WebThemePreference.light,
          pending: true,
        ),
      );
      final second = store.save(
        const NativeAppearanceSnapshot(
          preference: WebThemePreference.dark,
          pending: true,
        ),
      );
      await Future.wait([first, second]);
      final restored = await NativeAppearanceStore(file).read();
      expect(restored!.preference, WebThemePreference.dark);
      expect(restored.pending, isTrue);
      expect(restored.appearance, isNull);
      final encoded = jsonDecode(restored.encode()) as Map<String, dynamic>;
      expect(
        NativeAppearanceSnapshot.parse(
          jsonEncode({...encoded, 'cookie': 'private'}),
        ),
        isNull,
      );
      expect(
        NativeAppearanceSnapshot.parse(
          jsonEncode({...encoded, 'preference': 'invalid'}),
        ),
        isNull,
      );
      await file.writeAsString('broken');
      expect(await store.read(), isNull);
    },
  );
}
