import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../api/api_client.dart';
import '../api/models.dart';
import '../config.dart';

enum SessionStatus { restoring, signedOut, signedIn }

/// The signed-in seller. The access token stays in memory; the refresh token is kept in shared_preferences
/// (a demo, not a secure store) so the app opens signed in.
class Session extends ChangeNotifier {
  Session(this._client) {
    _client.onUnauthorized = refresh;
  }

  final ApiClient _client;
  static const _refreshKey = 'nowcleany.refreshToken';

  SessionStatus status = SessionStatus.restoring;
  UserProfile? user;

  /// Message for the login screen (session expired), shown once.
  String? notice;

  String? _refreshToken;
  Future<bool>? _refreshing;

  /// On launch: resumes the session with the stored refresh token, if any.
  Future<void> restore() async {
    final prefs = await SharedPreferences.getInstance();
    final stored = prefs.getString(_refreshKey);
    if (stored == null) return _signedOut();
    try {
      final data = await _client.post('/v1/auth/refresh', body: {'refreshToken': stored}, auth: false);
      await _accept(AuthResult.fromJson(data as Json));
    } on ApiException catch (error) {
      // Rejected token: forget it. Server unreachable: keep it for the next launch.
      if (error.status != null) await prefs.remove(_refreshKey);
      _signedOut();
    }
  }

  Future<void> login(String email, String password) async {
    final data = await _client.post(
      '/v1/auth/login',
      body: {'email': email.trim(), 'password': password},
      auth: false,
    );
    await _accept(AuthResult.fromJson(data as Json));
  }

  Future<void> logout() async {
    final token = _refreshToken;
    await _clear();
    _signedOut();
    if (token != null) {
      try {
        await _client.post('/v1/auth/logout', body: {'refreshToken': token}, auth: false);
      } on ApiException {
        // The session is already closed on the phone.
      }
    }
  }

  /// Refreshes the access token (one request at a time). False when the session is over.
  Future<bool> refresh() => _refreshing ??= _refresh().whenComplete(() => _refreshing = null);

  Future<bool> _refresh() async {
    final token = _refreshToken;
    if (token == null) return false;
    try {
      final data = await _client.post('/v1/auth/refresh', body: {'refreshToken': token}, auth: false);
      final result = AuthResult.fromJson(data as Json);
      _client.accessToken = result.accessToken;
      _refreshToken = result.refreshToken;
      user = result.user;
      await _store(result.refreshToken);
      return true;
    } on ApiException catch (error) {
      if (error.status != null) {
        await _clear();
        notice = 'Tu sesión expiró. Inicia sesión de nuevo.';
        _signedOut();
      }
      return false;
    }
  }

  Future<void> _accept(AuthResult result) async {
    if (!result.user.can(AppConfig.requiredPermission)) {
      unawaited(_revoke(result.refreshToken));
      await _clear();
      throw const ApiException('Esta app es para vendedores.');
    }
    _client.accessToken = result.accessToken;
    _refreshToken = result.refreshToken;
    user = result.user;
    notice = null;
    await _store(result.refreshToken);
    status = SessionStatus.signedIn;
    notifyListeners();
  }

  Future<void> _revoke(String refreshToken) async {
    try {
      await _client.post('/v1/auth/logout', body: {'refreshToken': refreshToken}, auth: false);
    } on ApiException {
      // Best effort.
    }
  }

  Future<void> _store(String refreshToken) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_refreshKey, refreshToken);
  }

  Future<void> _clear() async {
    _client.accessToken = null;
    _refreshToken = null;
    user = null;
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_refreshKey);
  }

  void _signedOut() {
    status = SessionStatus.signedOut;
    notifyListeners();
  }
}
