import 'package:flutter/material.dart';

import '../../api/api_client.dart';
import '../../api/models.dart';
import '../../session/app_scope.dart';
import '../../ui/formatters.dart';
import '../../ui/theme.dart';
import '../../ui/widgets.dart';
import '../customers/branch_actions.dart';

/// The seller's own sales orders.
class OrdersTab extends StatefulWidget {
  const OrdersTab({super.key});

  @override
  State<OrdersTab> createState() => _OrdersTabState();
}

class _OrdersTabState extends State<OrdersTab> {
  List<SalesOrder>? _orders;
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
    try {
      final orders = await AppScope.of(context).api.orders();
      if (mounted) setState(() => _orders = orders);
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final orders = _orders;
    if (_loading && orders == null) return const LoadingView(label: 'Cargando tus preventas…');
    if (_error != null && orders == null) return MessageView.error(_error!, onRetry: _load);
    if (orders == null) return const SizedBox.shrink();

    if (orders.isEmpty) {
      return RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          children: const [
            SizedBox(height: 80),
            MessageView(
              icon: Icons.receipt_long_outlined,
              title: 'Aún no tienes preventas',
              message: 'Tómalas desde Clientes, el mapa o una visita.',
            ),
          ],
        ),
      );
    }

    final confirmed = orders.where((o) => o.status == 'CONFIRMED').length;
    final drafts = orders.where((o) => o.status == 'DRAFT').length;
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView.separated(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
        itemCount: orders.length + 1,
        separatorBuilder: (_, _) => const SizedBox(height: 10),
        itemBuilder: (context, index) {
          if (index == 0) {
            return Padding(
              padding: const EdgeInsets.fromLTRB(4, 0, 4, 4),
              child: Text(
                [
                  orders.length == 1 ? '1 preventa' : '${orders.length} preventas',
                  if (confirmed > 0) confirmed == 1 ? '1 guardada' : '$confirmed guardadas',
                  if (drafts > 0) drafts == 1 ? '1 borrador' : '$drafts borradores',
                ].join(' · '),
                style: const TextStyle(color: BrandColors.muted, fontWeight: FontWeight.w600),
              ),
            );
          }
          final order = orders[index - 1];
          return OrderCard(order: order, onTap: () => showOrderSheet(context, order));
        },
      ),
    );
  }
}

class OrderCard extends StatelessWidget {
  const OrderCard({super.key, required this.order, this.onTap});

  final SalesOrder order;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final delivery = parseIsoDate(order.estimatedDeliveryDate);
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Text(
                    order.label,
                    style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16, color: BrandColors.navy),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    formatShortDate(order.createdAt),
                    style: const TextStyle(color: BrandColors.muted, fontSize: 12),
                  ),
                  const Spacer(),
                  orderStatusPill(order),
                ],
              ),
              const SizedBox(height: 10),
              Text(order.customerName, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
              if (order.branchName != null) Text(order.branchName!, style: const TextStyle(color: BrandColors.muted)),
              const SizedBox(height: 12),
              Row(
                children: [
                  const Icon(Icons.local_shipping_outlined, size: 18, color: BrandColors.muted),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      delivery == null ? 'Sin fecha de entrega' : 'Entrega ${formatShortDate(delivery)}',
                      style: const TextStyle(fontSize: 13),
                    ),
                  ),
                  const Icon(Icons.inventory_2_outlined, size: 18, color: BrandColors.muted),
                  const SizedBox(width: 6),
                  Text(
                    '${formatNumber(order.totalUnits)} und.',
                    style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

Widget orderStatusPill(SalesOrder order) {
  final (Color fg, Color bg) = switch (order.status) {
    'CONFIRMED' || 'INVOICED' || 'READY' || 'DISPATCHED' => (BrandColors.info, BrandColors.infoSoft),
    'PARTIAL' => (BrandColors.warning, BrandColors.warningSoft),
    'DELIVERED' => (BrandColors.success, BrandColors.successSoft),
    'CANCELLED' => (BrandColors.danger, BrandColors.dangerSoft),
    _ => (BrandColors.muted, BrandColors.neutralSoft),
  };
  return Pill(label: order.sellerStatus, foreground: fg, background: bg);
}

/// Detail of an order: lines, delivery and notes.
Future<void> showOrderSheet(BuildContext context, SalesOrder order) {
  final delivery = parseIsoDate(order.estimatedDeliveryDate);
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    builder: (context) => DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.6,
      minChildSize: 0.4,
      maxChildSize: 0.92,
      builder: (context, controller) => ListView(
        controller: controller,
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
        children: [
          Row(
            children: [
              Text(order.label, style: Theme.of(context).textTheme.titleLarge?.copyWith(color: BrandColors.navy)),
              const Spacer(),
              orderStatusPill(order),
            ],
          ),
          const SizedBox(height: 12),
          Text(order.customerName, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
          if (order.branchName != null) InfoRow(icon: Icons.storefront_outlined, text: order.branchName!),
          if (order.branchAddress != null && order.branchAddress!.isNotEmpty)
            InfoRow(icon: Icons.place_outlined, text: order.branchAddress!),
          InfoRow(
            icon: Icons.local_shipping_outlined,
            text: delivery == null ? 'Sin fecha estimada de entrega' : 'Entrega estimada: ${formatLongDate(delivery)}',
          ),
          if (order.notes != null && order.notes!.trim().isNotEmpty)
            InfoRow(icon: Icons.notes_rounded, text: order.notes!),
          const SectionLabel('PRODUCTOS'),
          ...order.lines.map(
            (line) => Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(line.productName, style: const TextStyle(fontWeight: FontWeight.w600)),
                        Text(line.productCode, style: const TextStyle(color: BrandColors.muted, fontSize: 12)),
                      ],
                    ),
                  ),
                  Text(
                    '${formatNumber(parseDecimal(line.quantity))} ${unitLabel(line.unit)}',
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                ],
              ),
            ),
          ),
          const Divider(),
          Padding(
            padding: const EdgeInsets.only(top: 12),
            child: Row(
              children: [
                const Expanded(
                  child: Text('Total', style: TextStyle(fontWeight: FontWeight.w800)),
                ),
                Text(
                  '${formatNumber(order.totalUnits)} und.',
                  style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16, color: BrandColors.navy),
                ),
              ],
            ),
          ),
          if (order.isDraft) ...[const SizedBox(height: 24), _DraftActions(order: order)],
        ],
      ),
    ),
  );
}

/// A draft from its detail sheet: keep editing it, or save it as an order as it is.
class _DraftActions extends StatefulWidget {
  const _DraftActions({required this.order});

  final SalesOrder order;

  @override
  State<_DraftActions> createState() => _DraftActionsState();
}

class _DraftActionsState extends State<_DraftActions> {
  bool _busy = false;

  Future<void> _edit() async {
    setState(() => _busy = true);
    final scope = AppScope.of(context);
    final navigator = Navigator.of(context);
    try {
      final customer = await scope.api.customer(widget.order.customerId);
      final branch = customer.branches.firstWhere(
        (b) => b.id == widget.order.branchId,
        orElse: () => customer.activeBranches.first,
      );
      if (!mounted) return;
      navigator.pop();
      await startOrder(navigator.context, customer, branch, draft: widget.order);
    } on ApiException catch (error) {
      if (mounted) {
        setState(() => _busy = false);
        showMessage(context, error.message);
      }
    }
  }

  Future<void> _confirm() async {
    setState(() => _busy = true);
    final scope = AppScope.of(context);
    final messenger = ScaffoldMessenger.of(context);
    final navigator = Navigator.of(context);
    try {
      final order = await scope.api.confirmOrder(widget.order.id);
      scope.events.changed();
      navigator.pop();
      messenger.showSnackBar(SnackBar(content: Text('Preventa ${order.label} guardada.')));
    } on ApiException catch (error) {
      if (mounted) {
        setState(() => _busy = false);
        messenger.showSnackBar(SnackBar(content: Text(error.message)));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        FilledButton.icon(
          onPressed: _busy ? null : _confirm,
          icon: _busy
              ? const SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white),
                )
              : const Icon(Icons.check_rounded),
          label: const Text('Guardar preventa'),
        ),
        const SizedBox(height: 8),
        OutlinedButton.icon(
          onPressed: _busy ? null : _edit,
          icon: const Icon(Icons.edit_rounded),
          label: const Text('Editar'),
        ),
      ],
    );
  }
}
