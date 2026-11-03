import 'dart:io';

import 'package:file_selector/file_selector.dart';
import 'package:flutter/services.dart';

import 'native_invitation_share.dart';

/// Only validated generated PNG bytes reach the platform's user-visible save destination.
Future<bool> saveNativeSlipImages(List<NativeSlipImage> images) async {
  if (Platform.isAndroid || Platform.isIOS) {
    return await const MethodChannel(
          'com.goalhint.goal_hint/slip_download',
        ).invokeMethod<bool>(
          'savePngs',
          images
              .map((image) => {'name': image.name, 'bytes': image.bytes})
              .toList(),
        ) ??
        false;
  }
  for (final image in images) {
    final location = await getSaveLocation(
      suggestedName: image.name,
      acceptedTypeGroups: const [
        XTypeGroup(label: 'PNG image', extensions: ['png']),
      ],
    );
    if (location == null) return false;
    await XFile.fromData(
      image.bytes,
      mimeType: 'image/png',
      name: image.name,
    ).saveTo(location.path);
  }
  return true;
}
