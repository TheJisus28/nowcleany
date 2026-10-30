import 'package:flutter/material.dart';
import 'package:mapbox_maps_flutter/mapbox_maps_flutter.dart' as mb;

import '../../api/api_client.dart';
import '../../api/models.dart';
import '../../session/app_scope.dart';
import '../../ui/theme.dart';
import '../../ui/widgets.dart';
import '../location/device_location.dart';
import '../map/directions.dart';
import 'branch_actions.dart';

/// One branch on the map, with the seller's position and the route to get there.
class BranchMapScreen extends StatefulWidget {
  const BranchMapScreen({super.key, required this.customer, required this.branch});

  final Customer customer;
  final Branch branch;

  @override
  State<BranchMapScreen> createState() => _BranchMapScreenState();
}

class _BranchMapScreenState extends State<BranchMapScreen> {
  MapConfig? _config;
  String? _error;
  mb.MapboxMap? _map;
  bool _locating = false;

  Branch get _branch => widget.branch;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final config = await AppScope.of(context).api.mapConfig();
      final token = config.token;
      if (token != null) mb.MapboxOptions.setAccessToken(token);
      if (mounted) setState(() => _config = config);
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    }
  }

  static mb.Point _point(double latitude, double longitude) => mb.Point(coordinates: mb.Position(longitude, latitude));

  Future<void> _onMapCreated(mb.MapboxMap map) async {
    _map = map;
    await map.scaleBar.updateSettings(mb.ScaleBarSettings(enabled: false));
    final circles = await map.annotations.createCircleAnnotationManager();
    await circles.create(
      mb.CircleAnnotationOptions(
        geometry: _point(_branch.latitude!, _branch.longitude!),
        circleRadius: 12,
        circleColor: BrandColors.aqua.toARGB32(),
        circleStrokeColor: BrandColors.navy.toARGB32(),
        circleStrokeWidth: 4,
      ),
    );
    if (await DeviceLocation.ensurePermission()) {
      await map.location.updateSettings(
        mb.LocationComponentSettings(enabled: true, pulsingEnabled: true, pulsingColor: BrandColors.info.toARGB32()),
      );
    }
  }

  Future<void> _centerOnMe() async {
    if (_locating) return;
    setState(() => _locating = true);
    try {
      final position = await DeviceLocation.current();
      await _map?.easeTo(
        mb.CameraOptions(center: _point(position.latitude, position.longitude), zoom: 15.5),
        mb.MapAnimationOptions(duration: 800),
      );
    } on LocationFailure catch (failure) {
      if (mounted) showMessage(context, failure.message);
    } finally {
      if (mounted) setState(() => _locating = false);
    }
  }

  Future<void> _directions() async {
    final opened = await openDirections(_branch.latitude!, _branch.longitude!);
    if (!opened && mounted) showMessage(context, 'No hay una app de mapas para abrir la ruta.');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.customer.name)),
      body: Column(
        children: [
          Expanded(child: _buildMap()),
          _BranchCard(customer: widget.customer, branch: _branch, onDirections: _directions),
        ],
      ),
    );
  }

  Widget _buildMap() {
    final config = _config;
    if (_error != null && config == null) return MessageView.error(_error!, onRetry: _load);
    if (config == null) return const LoadingView(label: 'Cargando el mapa…');
    if (config.token == null) {
      return const MessageView(icon: Icons.map_outlined, title: 'Mapa no disponible', message: 'Usa «Cómo llegar».');
    }
    return Stack(
      children: [
        mb.MapWidget(
          key: ValueKey('branch-${_branch.id}'),
          styleUri: mb.MapboxStyles.MAPBOX_STREETS,
          viewport: mb.CameraViewportState(center: _point(_branch.latitude!, _branch.longitude!), zoom: 16),
          onMapCreated: _onMapCreated,
        ),
        Positioned(
          right: 16,
          bottom: 16,
          child: FloatingActionButton(
            heroTag: null,
            tooltip: 'Mi ubicación',
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

class _BranchCard extends StatelessWidget {
  const _BranchCard({required this.customer, required this.branch, required this.onDirections});

  final Customer customer;
  final Branch branch;
  final VoidCallback onDirections;

  @override
  Widget build(BuildContext context) {
    return BottomActionBar(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(branch.name, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
          if (branch.fullAddress != null) InfoRow(icon: Icons.place_outlined, text: branch.fullAddress!, muted: true),
          const SizedBox(height: 10),
          FilledButton.icon(
            onPressed: onDirections,
            icon: const Icon(Icons.directions_rounded),
            label: const Text('Cómo llegar'),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () => startVisit(context, customer, branch),
                  icon: const Icon(Icons.where_to_vote_outlined),
                  label: const Text('Visita'),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () => startOrder(context, customer, branch),
                  icon: const Icon(Icons.add_shopping_cart_rounded),
                  label: const Text('Preventa'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
