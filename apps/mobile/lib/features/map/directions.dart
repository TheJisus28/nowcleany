import 'package:flutter/services.dart';

const _channel = MethodChannel('scip/maps');

/// Opens the phone's maps app with the route to a point. False when no maps app could open it.
Future<bool> openDirections(double latitude, double longitude) async {
  try {
    final opened = await _channel.invokeMethod<bool>('directions', {'latitude': latitude, 'longitude': longitude});
    return opened ?? false;
  } on PlatformException {
    return false;
  } on MissingPluginException {
    return false;
  }
}
