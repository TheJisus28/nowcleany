import 'package:geolocator/geolocator.dart';
import 'package:permission_handler/permission_handler.dart' show openAppSettings;

/// What the seller can do to fix a location problem.
enum LocationFix { retry, locationSettings, appSettings }

class LocationFailure implements Exception {
  const LocationFailure(this.message, this.fix);

  final String message;
  final LocationFix fix;

  String get actionLabel => switch (fix) {
    LocationFix.retry => 'Intentar de nuevo',
    LocationFix.locationSettings => 'Activar ubicación',
    LocationFix.appSettings => 'Abrir ajustes',
  };

  @override
  String toString() => message;
}

/// The phone's position: asks for the permission when needed (geolocator) and sends the seller to the app
/// settings when it was blocked (permission_handler).
abstract final class DeviceLocation {
  static Future<bool> hasPermission() async {
    final permission = await Geolocator.checkPermission();
    return permission == LocationPermission.whileInUse || permission == LocationPermission.always;
  }

  /// Asks for the permission if it was never answered. True when granted.
  static Future<bool> ensurePermission() async {
    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) permission = await Geolocator.requestPermission();
    return permission == LocationPermission.whileInUse || permission == LocationPermission.always;
  }

  /// Current position with high accuracy, or a [LocationFailure] with what to do.
  static Future<Position> current() async {
    if (!await Geolocator.isLocationServiceEnabled()) {
      throw const LocationFailure(
        'La ubicación del celular está apagada. Actívala para continuar.',
        LocationFix.locationSettings,
      );
    }
    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) permission = await Geolocator.requestPermission();
    if (permission == LocationPermission.denied) {
      throw const LocationFailure('Necesitamos tu ubicación para registrar la visita.', LocationFix.retry);
    }
    if (permission == LocationPermission.deniedForever) {
      throw const LocationFailure(
        'El permiso de ubicación está bloqueado. Actívalo en los ajustes de la app.',
        LocationFix.appSettings,
      );
    }
    try {
      return await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.high, timeLimit: Duration(seconds: 25)),
      );
    } on Exception {
      throw const LocationFailure('No logramos ubicarte. Intenta en un lugar más despejado.', LocationFix.retry);
    }
  }

  static Future<void> fix(LocationFix fix) async {
    switch (fix) {
      case LocationFix.locationSettings:
        await Geolocator.openLocationSettings();
      case LocationFix.appSettings:
        await openAppSettings();
      case LocationFix.retry:
        break;
    }
  }
}
