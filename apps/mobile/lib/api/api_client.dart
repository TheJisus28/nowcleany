import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

/// An API error with the message to show (the problem+json `detail`, in Spanish).
class ApiException implements Exception {
  const ApiException(this.message, {this.status});

  final String message;

  /// HTTP status; null when the server could not be reached.
  final int? status;

  @override
  String toString() => message;
}

/// Called on a 401: refreshes the access token once; true when the request can be retried.
typedef UnauthorizedHandler = Future<bool> Function();

/// JSON over HTTP with the bearer token, one refresh-and-retry on 401 and problem+json errors.
class ApiClient {
  ApiClient({required this.baseUrl, http.Client? client}) : _http = client ?? http.Client();

  final String baseUrl;
  final http.Client _http;

  /// The access token lives only in memory.
  String? accessToken;
  UnauthorizedHandler? onUnauthorized;

  static const _timeout = Duration(seconds: 20);
  static const _offline = 'No pudimos conectar con el servidor. Revisa tu conexión e intenta de nuevo.';

  Future<dynamic> get(String path, {Map<String, String>? query}) => _send('GET', path, query: query);

  Future<dynamic> patch(String path, {Object? body}) => _send('PATCH', path, body: body);
  Future<dynamic> post(String path, {Object? body, bool auth = true}) => _send('POST', path, body: body, auth: auth);

  Future<dynamic> _send(
    String method,
    String path, {
    Map<String, String>? query,
    Object? body,
    bool auth = true,
    bool retried = false,
  }) async {
    var uri = Uri.parse('$baseUrl$path');
    if (query != null && query.isNotEmpty) uri = uri.replace(queryParameters: query);

    final request = http.Request(method, uri)..headers['Accept'] = 'application/json';
    final token = accessToken;
    if (auth && token != null) request.headers['Authorization'] = 'Bearer $token';
    if (body != null) {
      request.headers['Content-Type'] = 'application/json; charset=utf-8';
      request.body = jsonEncode(body);
    }

    final http.Response response;
    try {
      response = await http.Response.fromStream(await _http.send(request).timeout(_timeout));
    } on SocketException {
      throw const ApiException(_offline);
    } on TimeoutException {
      throw const ApiException(_offline);
    } on http.ClientException {
      throw const ApiException(_offline);
    }

    if (response.statusCode == 401 && auth && !retried && onUnauthorized != null) {
      if (await onUnauthorized!()) {
        return _send(method, path, query: query, body: body, auth: auth, retried: true);
      }
    }

    final text = utf8.decode(response.bodyBytes);
    if (response.statusCode >= 200 && response.statusCode < 300) {
      return text.isEmpty ? null : jsonDecode(text);
    }
    throw ApiException(_problemDetail(text, response.statusCode), status: response.statusCode);
  }

  static String _problemDetail(String text, int status) {
    try {
      final json = jsonDecode(text);
      if (json is Map<String, dynamic>) {
        final detail = json['detail'];
        if (detail is String && detail.trim().isNotEmpty) return detail;
        final title = json['title'];
        if (title is String && title.trim().isNotEmpty) return title;
      }
    } on FormatException {
      // Not JSON: fall back to a message by status.
    }
    return switch (status) {
      401 => 'Tu sesión expiró. Inicia sesión de nuevo.',
      403 => 'No tienes permiso para hacer esto.',
      404 => 'No encontramos lo que buscabas.',
      429 => 'Hiciste demasiadas solicitudes. Espera un momento e intenta de nuevo.',
      _ => 'Ocurrió un error inesperado. Intenta de nuevo.',
    };
  }
}
