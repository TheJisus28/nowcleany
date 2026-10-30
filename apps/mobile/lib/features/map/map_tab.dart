import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:mapbox_maps_flutter/mapbox_maps_flutter.dart' as mb;

import '../../api/api_client.dart';
import '../../api/models.dart';
import '../../session/app_scope.dart';
import '../../ui/theme.dart';
import '../../ui/widgets.dart';
import '../customers/branch_actions.dart';
import '../location/device_location.dart';

/// The seller's branches on a Mapbox map (token from the API), with their own position.
class MapTab extends StatefulWidget {
  const MapTab({super.key});

  @override
  State<MapTab> createState() => _MapTabState();
}

class _MapTabState extends State<MapTab> {
  MapConfig? _config;
  List<Customer>? _customers;
  String? _error;
  bool _loading = true;

  mb.MapboxMap? _map;
  mb.CircleAnnotationManager? _circles;
  mb.Cancelable? _tapSubscription;
  final Map<String, (Customer, Branch)> _byAnnotation = {};
  bool _locating = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  @override
  void dispose() {
    _tapSubscription?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final api = AppScope.of(context).api;
    try {
      final results = await Future.wait([api.mapConfig(), api.customers()]);
      final config = results[0] as MapConfig;
      final token = config.token;
      if (token != null) mb.MapboxOptions.setAccessToken(token);
      if (!mounted) return;
      setState(() {
        _config = config;
        _customers = results[1] as List<Customer>;
      });
      await _drawBranches();
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  List<(Customer, Branch)> get _located => [
    for (final customer in _customers ?? const <Customer>[])
      for (final branch in customer.activeBranches)
        if (branch.hasLocation) (customer, branch),
  ];

  int get _withoutLocation => [
    for (final customer in _customers ?? const <Customer>[])
      for (final branch in customer.activeBranches)
        if (!branch.hasLocation) branch,
  ].length;

  Future<void> _onMapCreated(mb.MapboxMap map) async {
    _map = map;
    await map.scaleBar.updateSettings(mb.ScaleBarSettings(enabled: false));
    final circles = await map.annotations.createCircleAnnotationManager();
    _circles = circles;
    _tapSubscription = circles.tapEvents(
      onTap: (annotation) {
        final entry = _byAnnotation[annotation.id];
        if (entry != null && mounted) showBranchSheet(context, entry.$1, entry.$2);
      },
    );
    await _drawBranches(fit: true);
    if (await DeviceLocation.ensurePermission()) await _showPuck();
  }

  Future<void> _drawBranches({bool fit = false}) async {
    final circles = _circles;
    if (circles == null) return;
    await circles.deleteAll();
    _byAnnotation.clear();
    final entries = _located;
    if (entries.isEmpty) return;
    final created = await circles.createMulti([
      for (final (_, branch) in entries)
        mb.CircleAnnotationOptions(
          geometry: _point(branch.latitude!, branch.longitude!),
          circleRadius: branch.isMain ? 10 : 8,
          circleColor: BrandColors.aqua.toARGB32(),
          circleStrokeColor: BrandColors.navy.toARGB32(),
          circleStrokeWidth: 3,
        ),
    ]);
    for (var i = 0; i < created.length && i < entries.length; i++) {
      final annotation = created[i];
      if (annotation != null) _byAnnotation[annotation.id] = entries[i];
    }
    if (fit) await _fitTo(entries.map((e) => e.$2).toList());
  }

  /// Centers the camera on the branches with a zoom that shows them all.
  Future<void> _fitTo(List<Branch> branches) async {
    final map = _map;
    if (map == null || branches.isEmpty) return;
    final lats = branches.map((b) => b.latitude!).toList();
    final lngs = branches.map((b) => b.longitude!).toList();
    final minLat = lats.reduce(math.min), maxLat = lats.reduce(math.max);
    final minLng = lngs.reduce(math.min), maxLng = lngs.reduce(math.max);
    final span = math.max(maxLat - minLat, maxLng - minLng);
    final zoom = (math.log(360 / math.max(span, 0.004)) / math.ln2 - 1.3).clamp(9.0, 15.5);
    await map.setCamera(mb.CameraOptions(center: _point((minLat + maxLat) / 2, (minLng + maxLng) / 2), zoom: zoom));
  }

  Future<void> _showPuck() async {
    await _map?.location.updateSettings(
      mb.LocationComponentSettings(
        enabled: true,
        pulsingEnabled: true,
        pulsingColor: BrandColors.info.toARGB32(),
        puckBearingEnabled: false,
      ),
    );
  }

  Future<void> _centerOnMe() async {
    if (_locating) return;
    setState(() => _locating = true);
    try {
      final position = await DeviceLocation.current();
      await _showPuck();
      await _map?.easeTo(
        mb.CameraOptions(center: _point(position.latitude, position.longitude), zoom: 15.5),
        mb.MapAnimationOptions(duration: 800),
      );
    } on LocationFailure catch (failure) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(
          SnackBar(
            content: Text(failure.message),
            action: failure.fix == LocationFix.retry
                ? null
                : SnackBarAction(
                    label: failure.actionLabel,
                    textColor: BrandColors.aqua,
                    onPressed: () => DeviceLocation.fix(failure.fix),
                  ),
          ),
        );
    } finally {
      if (mounted) setState(() => _locating = false);
    }
  }

  static mb.Point _point(double latitude, double longitude) => mb.Point(coordinates: mb.Position(longitude, latitude));

  @override
  Widget build(BuildContext context) {
    final config = _config;
    if (_loading && config == null) return const LoadingView(label: 'Cargando el mapa…');
    if (_error != null && config == null) return MessageView.error(_error!, onRetry: _load);
    if (config == null) return const SizedBox.shrink();
    if (config.token == null) return _BranchListWithoutMap(customers: _customers ?? const [], onRefresh: _load);

    final located = _located.length;
    final missing = _withoutLocation;
    return Stack(
      children: [
        mb.MapWidget(
          key: const ValueKey('portfolio-map'),
          styleUri: mb.MapboxStyles.MAPBOX_STREETS,
          viewport: mb.CameraViewportState(center: _point(config.center.latitude, config.center.longitude), zoom: 12.5),
          onMapCreated: _onMapCreated,
        ),
        Positioned(
          top: 12,
          left: 12,
          right: 12,
          child: Material(
            color: Colors.white,
            elevation: 3,
            shadowColor: Colors.black26,
            borderRadius: BorderRadius.circular(14),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              child: Row(
                children: [
                  Container(
                    width: 14,
                    height: 14,
                    decoration: BoxDecoration(
                      color: BrandColors.aqua,
                      shape: BoxShape.circle,
                      border: Border.all(color: BrandColors.navy, width: 3),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      _customers?.isEmpty ?? true
                          ? 'Aún no tienes clientes en tu cartera'
                          : located == 1
                          ? '1 sucursal en el mapa'
                          : '$located sucursales en el mapa',
                      style: const TextStyle(fontWeight: FontWeight.w700),
                    ),
                  ),
                  if (missing > 0)
                    Pill(
                      label: '$missing sin ubicación',
                      foreground: BrandColors.warning,
                      background: BrandColors.warningSoft,
                    ),
                ],
              ),
            ),
          ),
        ),
        Positioned(
          right: 16,
          bottom: 24,
          child: FloatingActionButton(
            heroTag: null,
            tooltip: 'Centrar en mi ubicación',
            backgroundColor: Colors.white,
            foregroundColor: BrandColors.navy,
            onPressed: _centerOnMe,
            child: _locating
                ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.4))
                : const Icon(Icons.my_location_rounded),
          ),
        ),
      ],
    );
  }
}

/// Without a Mapbox token: a notice and the branches as a list.
class _BranchListWithoutMap extends StatelessWidget {
  const _BranchListWithoutMap({required this.customers, required this.onRefresh});

  final List<Customer> customers;
  final Future<void> Function() onRefresh;

  @override
  Widget build(BuildContext context) {
    final rows = [
      for (final customer in customers)
        for (final branch in customer.activeBranches) (customer, branch),
    ];
    return RefreshIndicator(
      onRefresh: onRefresh,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
        children: [
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(color: BrandColors.warningSoft, borderRadius: BorderRadius.circular(14)),
            child: const Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.map_outlined, color: BrandColors.warning),
                SizedBox(width: 10),
                Expanded(
                  child: Text(
                    'El mapa no está disponible: falta configurar el token de Mapbox en el servidor. '
                    'Mientras tanto, aquí tienes tus sucursales.',
                    style: TextStyle(color: BrandColors.warning, height: 1.4, fontWeight: FontWeight.w600),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 8),
          if (rows.isEmpty)
            const MessageView(
              icon: Icons.storefront_outlined,
              title: 'Aún no tienes clientes',
              message: 'Cuando gerencia te asigne clientes, aparecerán aquí con sus sucursales.',
            ),
          for (final (customer, branch) in rows)
            Padding(
              padding: const EdgeInsets.only(top: 10),
              child: Card(
                child: ListTile(
                  contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                  leading: Icon(
                    branch.hasLocation ? Icons.location_on_rounded : Icons.location_off_outlined,
                    color: branch.hasLocation ? BrandColors.navy : BrandColors.muted,
                  ),
                  title: Text(customer.name, style: const TextStyle(fontWeight: FontWeight.w700)),
                  subtitle: Text(
                    [branch.name, ?branch.fullAddress].join(' · '),
                    style: const TextStyle(color: BrandColors.muted),
                  ),
                  trailing: const Icon(Icons.chevron_right_rounded),
                  onTap: () => showBranchSheet(context, customer, branch),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
