/// Build-time configuration (`--dart-define`).
abstract final class AppConfig {
  /// The API. Default: the host machine as seen from the Android emulator (the API listens on 127.0.0.1:3000).
  static const apiBaseUrl = String.fromEnvironment('API_BASE_URL', defaultValue: 'http://10.0.2.2:3000');

  /// Only sellers (role `sales`) use this app.
  static const requiredPermission = 'visits:write';
}
