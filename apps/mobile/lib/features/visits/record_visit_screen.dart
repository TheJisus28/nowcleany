import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';

import '../../api/api_client.dart';
import '../../api/models.dart';
import '../../session/app_scope.dart';
import '../../ui/formatters.dart';
import '../../ui/theme.dart';
import '../../ui/widgets.dart';
import '../location/device_location.dart';
import '../orders/new_order_screen.dart';

/// Check-in at a customer's branch with the phone's GPS.
class RecordVisitScreen extends StatefulWidget {
  const RecordVisitScreen({super.key, required this.customer, required this.branch});

  final Customer customer;
  final Branch branch;

  @override
  State<RecordVisitScreen> createState() => _RecordVisitScreenState();
}

class _RecordVisitScreenState extends State<RecordVisitScreen> {
  final _notes = TextEditingController();
  Position? _position;
  LocationFailure? _locationError;
  bool _locating = false;
  bool _sending = false;
  Visit? _visit;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _locate());
  }

  @override
  void dispose() {
    _notes.dispose();
    super.dispose();
  }

  Future<void> _locate() async {
    setState(() {
      _locating = true;
      _locationError = null;
    });
    try {
      final position = await DeviceLocation.current();
      if (mounted) setState(() => _position = position);
    } on LocationFailure catch (failure) {
      if (mounted) setState(() => _locationError = failure);
    } finally {
      if (mounted) setState(() => _locating = false);
    }
  }

  Future<void> _fixLocation(LocationFailure failure) async {
    await DeviceLocation.fix(failure.fix);
    if (mounted) await _locate();
  }

  Future<void> _submit() async {
    final position = _position;
    if (position == null || _sending) return;
    FocusScope.of(context).unfocus();
    setState(() => _sending = true);
    final scope = AppScope.of(context);
    try {
      final visit = await scope.api.recordVisit(
        customerId: widget.customer.id,
        branchId: widget.branch.id,
        latitude: position.latitude,
        longitude: position.longitude,
        accuracy: position.accuracy,
        notes: _notes.text,
      );
      scope.events.changed();
      if (mounted) setState(() => _visit = visit);
    } on ApiException catch (error) {
      if (mounted) showMessage(context, error.message);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  void _takeOrder(Visit visit) {
    Navigator.of(context).pushReplacement(
      MaterialPageRoute<void>(
        builder: (_) => NewOrderScreen(customer: widget.customer, branch: widget.branch, visitId: visit.id),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final visit = _visit;
    return Scaffold(
      appBar: AppBar(title: Text(visit == null ? 'Registrar visita' : 'Visita registrada')),
      body: visit == null ? _buildForm(context) : _VisitResult(visit: visit, onTakeOrder: () => _takeOrder(visit)),
    );
  }

  Widget _buildForm(BuildContext context) {
    return Column(
      children: [
        Expanded(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
            children: [
              _PlaceCard(customer: widget.customer, branch: widget.branch),
              const SectionLabel('TU UBICACIÓN'),
              _buildLocationCard(),
              const SectionLabel('NOTA (OPCIONAL)'),
              TextField(
                controller: _notes,
                maxLines: 4,
                minLines: 3,
                maxLength: 500,
                textCapitalization: TextCapitalization.sentences,
                decoration: const InputDecoration(
                  hintText: 'Ej.: el administrador pidió volver el viernes; tienen poco cloro en bodega.',
                ),
              ),
            ],
          ),
        ),
        BottomActionBar(
          child: FilledButton.icon(
            onPressed: _position == null || _sending ? null : _submit,
            icon: _sending
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white),
                  )
                : const Icon(Icons.where_to_vote_rounded),
            label: Text(_sending ? 'Registrando…' : 'Registrar visita'),
          ),
        ),
      ],
    );
  }

  Widget _buildLocationCard() {
    final error = _locationError;
    final position = _position;
    final Widget content;
    if (_locating) {
      content = const Row(
        children: [
          SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.4)),
          SizedBox(width: 14),
          Expanded(child: Text('Buscando tu ubicación con el GPS…')),
        ],
      );
    } else if (error != null) {
      content = Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Icon(Icons.location_disabled_rounded, color: BrandColors.danger),
              const SizedBox(width: 12),
              Expanded(child: Text(error.message, style: const TextStyle(height: 1.4))),
            ],
          ),
          const SizedBox(height: 12),
          OutlinedButton(onPressed: () => _fixLocation(error), child: Text(error.actionLabel)),
        ],
      );
    } else if (position != null) {
      content = Row(
        children: [
          Container(
            width: 42,
            height: 42,
            decoration: const BoxDecoration(color: BrandColors.successSoft, shape: BoxShape.circle),
            child: const Icon(Icons.my_location_rounded, color: BrandColors.success),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Ubicación lista', style: TextStyle(fontWeight: FontWeight.w700)),
                Text(
                  'Precisión de ±${formatDistance(position.accuracy)}',
                  style: const TextStyle(color: BrandColors.muted, fontSize: 13),
                ),
              ],
            ),
          ),
          TextButton.icon(
            onPressed: _locate,
            icon: const Icon(Icons.refresh_rounded, size: 18),
            label: const Text('Actualizar'),
          ),
        ],
      );
    } else {
      content = const SizedBox.shrink();
    }
    return Card(
      child: Padding(padding: const EdgeInsets.all(16), child: content),
    );
  }
}

class _PlaceCard extends StatelessWidget {
  const _PlaceCard({required this.customer, required this.branch});

  final Customer customer;
  final Branch branch;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: const LinearGradient(colors: [BrandColors.navy, Color(0xFF00507A)]),
        borderRadius: BorderRadius.circular(18),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            customer.name,
            style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w800),
          ),
          Text(customer.document, style: TextStyle(color: Colors.white.withValues(alpha: 0.7))),
          const SizedBox(height: 12),
          Row(
            children: [
              const Icon(Icons.storefront_rounded, color: BrandColors.aqua, size: 18),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  branch.name,
                  style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700),
                ),
              ),
            ],
          ),
          if (branch.fullAddress != null) ...[
            const SizedBox(height: 4),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Icon(Icons.place_outlined, color: BrandColors.aqua, size: 18),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(branch.fullAddress!, style: TextStyle(color: Colors.white.withValues(alpha: 0.85))),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _VisitResult extends StatelessWidget {
  const _VisitResult({required this.visit, required this.onTakeOrder});

  final Visit visit;
  final VoidCallback onTakeOrder;

  @override
  Widget build(BuildContext context) {
    final distance = visit.distanceM;
    final (IconData icon, Color fg, Color bg, String title, String detail) = switch (visit.onSite) {
      true => (
        Icons.check_circle_rounded,
        BrandColors.success,
        BrandColors.successSoft,
        'Visita registrada en sitio (a ${formatDistance(distance ?? 0)})',
        'Quedó registrada a las ${formatTime(visit.visitedAt)} en ${visit.branch.name}.',
      ),
      false => (
        Icons.wrong_location_rounded,
        BrandColors.warning,
        BrandColors.warningSoft,
        'Estás a ${formatDistance(distance ?? 0)} de la sucursal: la visita queda registrada como lejos',
        'Se considera en sitio dentro de ${formatDistance(visit.onSiteRadiusM)} (más la precisión del GPS).',
      ),
      null => (
        Icons.where_to_vote_rounded,
        BrandColors.navy,
        BrandColors.aquaSoft,
        'Visita registrada',
        'La sucursal no tiene ubicación registrada, así que no medimos la distancia.',
      ),
    };
    return Column(
      children: [
        Expanded(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(28),
              child: Column(
                children: [
                  Container(
                    width: 96,
                    height: 96,
                    decoration: BoxDecoration(color: bg, shape: BoxShape.circle),
                    child: Icon(icon, color: fg, size: 52),
                  ),
                  const SizedBox(height: 24),
                  Text(
                    title,
                    textAlign: TextAlign.center,
                    style: const TextStyle(fontSize: 21, fontWeight: FontWeight.w800, height: 1.3),
                  ),
                  const SizedBox(height: 10),
                  Text(
                    detail,
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: BrandColors.muted, height: 1.45),
                  ),
                  const SizedBox(height: 22),
                  Text(
                    '${visit.customerName} · ${visit.branch.name}',
                    textAlign: TextAlign.center,
                    style: const TextStyle(fontWeight: FontWeight.w600),
                  ),
                ],
              ),
            ),
          ),
        ),
        BottomActionBar(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              FilledButton.icon(
                onPressed: onTakeOrder,
                icon: const Icon(Icons.add_shopping_cart_rounded),
                label: const Text('Tomar preventa'),
              ),
              const SizedBox(height: 10),
              OutlinedButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Listo')),
            ],
          ),
        ),
      ],
    );
  }
}
