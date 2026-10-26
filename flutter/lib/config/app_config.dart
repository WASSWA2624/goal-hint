enum AppEnvironment { development, production }

class AppConfigException implements Exception {
  const AppConfigException(this.message);

  final String message;

  @override
  String toString() => message;
}

/// Public build configuration shared by the app and its future native adapters.
class AppConfig {
  const AppConfig._(this.environment, this.origin);

  final AppEnvironment environment;
  final Uri origin;

  static final _productionOrigin = Uri.parse('https://goalhint.com');
  static final _invalidCharacters = RegExp(r'[\s\\\x00-\x1f\x7f]');

  factory AppConfig.fromBuildEnvironment({required bool isAndroid}) {
    const isRelease = bool.fromEnvironment('dart.vm.product');
    const isProfile = bool.fromEnvironment('dart.vm.profile');
    return AppConfig.resolve(
      isDebugBuild: !isRelease && !isProfile,
      isAndroid: isAndroid,
      environmentName: const bool.hasEnvironment('APP_ENV')
          ? const String.fromEnvironment('APP_ENV')
          : null,
      developmentOrigin: const bool.hasEnvironment('DEV_APP_ORIGIN')
          ? const String.fromEnvironment('DEV_APP_ORIGIN')
          : null,
    );
  }

  factory AppConfig.resolve({
    required bool isDebugBuild,
    required bool isAndroid,
    String? environmentName,
    String? developmentOrigin,
  }) {
    final name =
        environmentName ?? (isDebugBuild ? 'development' : 'production');
    final environment = switch (name) {
      'development' => AppEnvironment.development,
      'production' => AppEnvironment.production,
      _ => throw const AppConfigException(
        'This app build has an invalid environment setting.',
      ),
    };
    if (!isDebugBuild && environment == AppEnvironment.development) {
      throw const AppConfigException(
        'Development addresses are available only in debug builds.',
      );
    }
    if (environment == AppEnvironment.production) {
      if (developmentOrigin != null) {
        throw const AppConfigException(
          'A production configuration cannot include a development address.',
        );
      }
      return AppConfig._(environment, _productionOrigin);
    }
    return AppConfig._(
      environment,
      _parseDevelopmentOrigin(
        developmentOrigin ??
            (isAndroid ? 'http://10.0.2.2:3000' : 'http://localhost:3000'),
      ),
    );
  }

  static Uri _parseDevelopmentOrigin(String value) {
    const invalid = AppConfigException(
      'The app address must be an HTTP or HTTPS origin with a host and optional port, without credentials, a path, query, or fragment.',
    );
    if (value.isEmpty || _invalidCharacters.hasMatch(value)) throw invalid;
    try {
      final uri = Uri.parse(value);
      final decodedHost = Uri.decodeComponent(uri.host);
      final authority = RegExp(
        r'^[a-zA-Z][a-zA-Z0-9+.-]*://([^/?#]*)',
      ).firstMatch(value)?.group(1);
      if (!uri.hasAuthority ||
          (uri.scheme != 'http' && uri.scheme != 'https') ||
          uri.host.isEmpty ||
          _invalidCharacters.hasMatch(decodedHost) ||
          RegExp(r'[/\\?#@]').hasMatch(decodedHost) ||
          authority == null ||
          authority.isEmpty ||
          authority.contains('@') ||
          uri.userInfo.isNotEmpty ||
          uri.hasQuery ||
          uri.hasFragment ||
          (uri.path.isNotEmpty && uri.path != '/')) {
        throw invalid;
      }
      final colon = authority.lastIndexOf(':');
      if (colon > authority.lastIndexOf(']')) {
        final port = authority.substring(colon + 1);
        final number = int.tryParse(port);
        if (!RegExp(r'^[0-9]+$').hasMatch(port) ||
            number == null ||
            number < 1 ||
            number > 65535) {
          throw invalid;
        }
      }
      return Uri.parse(uri.origin);
    } on FormatException {
      throw invalid;
    }
  }
}
