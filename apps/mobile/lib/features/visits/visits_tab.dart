import 'package:flutter/material.dart';

import '../../api/api_client.dart';
import '../../api/models.dart';
import '../../session/app_scope.dart';
import '../../ui/formatters.dart';
import '../../ui/theme.dart';
import '../../ui/widgets.dart';

/// Today's visits and the last 7 days, grouped by day.
class VisitsTab extends StatefulWidget {
  const VisitsTab({super.key});

  @override
  State<VisitsTab> createState() => _VisitsTabState();
}

class _VisitsTabState extends State<VisitsTab> {
  List<Visit>? _visits;
  String? _error;
  bool _loading = true;
  DataEvents? _events;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _events = AppScope.of(context).events..addListener(_load);
      _load();
    });
  }

  @override
  void dispose() {
    _events?.removeListener(_load);
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final today = dateOnly(DateTime.now());
    try {
      final visits = await AppScope.of(context).api
          .visits(from: isoDate(today.subtract(const Duration(days: 7))), to: isoDate(today));
      if (mounted) setState(() => _visits = visits);
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final visits = _visits;
    if (_loading && visits == null) return const LoadingView(label: 'Cargando tus visitas…');
    if (_error != null && visits == null) return MessageView.error(_error!, onRetry: _load);
    if (visits == null) return const SizedBox.shrink();

    if (visits.isEmpty) {
      return RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          children: const [
            SizedBox(height: 80),
            MessageView(
              icon: Icons.where_to_vote_outlined,
              title: 'Sin visitas en los últimos 7 días',
              message: 'Registra una visita desde el mapa o desde Clientes cuando llegues a una sucursal.',
            ),
          ],
        ),
      );
    }

    final groups = <DateTime, List<Visit>>{};
    for (final visit in visits) {
      groups.putIfAbsent(dateOnly(visit.visitedAt), () => []).add(visit);
    }
    final days = groups.keys.toList()..sort((a, b) => b.compareTo(a));
    final onSite = visits.where((v) => v.onSite == true).length;
    final withOrder = visits.where((v) => v.order != null).length;

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
        children: [
          Row(
            children: [
              Expanded(
                child: _Stat(value: '${visits.length}', label: visits.length == 1 ? 'visita' : 'visitas'),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _Stat(value: '$onSite', label: 'en sitio', color: BrandColors.success),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _Stat(value: '$withOrder', label: 'con preventa', color: BrandColors.info),
              ),
            ],
          ),
          for (final day in days) ...[
            SectionLabel(
              formatDayHeader(day).toUpperCase(),
              trailing: groups[day]!.length == 1 ? '1 visita' : '${groups[day]!.length} visitas',
            ),
            for (final visit in groups[day]!)
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: _VisitCard(visit: visit),
              ),
          ],
        ],
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({required this.value, required this.label, this.color = BrandColors.navy});

  final String value;
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              value,
              style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800, color: color),
            ),
            Text(
              label,
              style: const TextStyle(color: BrandColors.muted, fontSize: 12, fontWeight: FontWeight.w600),
            ),
          ],
        ),
      ),
    );
  }
}

class _VisitCard extends StatelessWidget {
  const _VisitCard({required this.visit});

  final Visit visit;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(
              width: 64,
              child: Text(
                formatTime(visit.visitedAt),
                style: const TextStyle(fontWeight: FontWeight.w700, color: BrandColors.navy, fontSize: 13),
              ),
            ),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(visit.customerName, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                  const SizedBox(height: 2),
                  Text(visit.branch.name, style: const TextStyle(color: BrandColors.muted)),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 6,
                    runSpacing: 6,
                    children: [
                      visitStatusPill(visit),
                      if (visit.order != null)
                        Pill(
                          icon: Icons.receipt_long_rounded,
                          label: 'Preventa ${visit.order!.label}',
                          foreground: BrandColors.info,
                          background: BrandColors.infoSoft,
                        ),
                    ],
                  ),
                  if (visit.notes != null && visit.notes!.trim().isNotEmpty) ...[
                    const SizedBox(height: 8),
                    Text(visit.notes!, style: const TextStyle(color: BrandColors.ink, fontSize: 13, height: 1.4)),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// "En sitio" (green), "Lejos · a 1,2 km" (amber) or "Sin ubicación de la sucursal".
Widget visitStatusPill(Visit visit) {
  return switch (visit.onSite) {
    true => const Pill(
      icon: Icons.check_circle_rounded,
      label: 'En sitio',
      foreground: BrandColors.success,
      background: BrandColors.successSoft,
    ),
    false => Pill(
      icon: Icons.wrong_location_rounded,
      label: 'Lejos · a ${formatDistance(visit.distanceM ?? 0)}',
      foreground: BrandColors.warning,
      background: BrandColors.warningSoft,
    ),
    null => const Pill(
      icon: Icons.location_off_outlined,
      label: 'Sin ubicación de la sucursal',
      foreground: BrandColors.muted,
      background: BrandColors.neutralSoft,
    ),
  };
}
