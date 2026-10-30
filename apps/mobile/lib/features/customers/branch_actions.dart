import 'package:flutter/material.dart';

import '../../api/models.dart';
import '../../ui/theme.dart';
import '../../ui/widgets.dart';
import '../orders/new_order_screen.dart';
import '../visits/record_visit_screen.dart';
import 'branch_map_screen.dart';

Future<void> startVisit(BuildContext context, Customer customer, Branch branch) {
  return Navigator.of(context).push(
    MaterialPageRoute<void>(
      builder: (_) => RecordVisitScreen(customer: customer, branch: branch),
    ),
  );
}

/// New order for a branch, or the draft to keep editing.
Future<void> startOrder(BuildContext context, Customer customer, Branch branch, {String? visitId, SalesOrder? draft}) {
  return Navigator.of(context).push(
    MaterialPageRoute<void>(
      builder: (_) => NewOrderScreen(customer: customer, branch: branch, visitId: visitId, draft: draft),
    ),
  );
}

Future<void> showBranchOnMap(BuildContext context, Customer customer, Branch branch) {
  if (!branch.hasLocation) {
    showMessage(context, 'Esta sucursal no tiene ubicación en el mapa.');
    return Future.value();
  }
  return Navigator.of(context).push(
    MaterialPageRoute<void>(
      builder: (_) => BranchMapScreen(customer: customer, branch: branch),
    ),
  );
}

/// The customer's card: document, phone, the branch address and what the seller can do there.
Future<void> showBranchSheet(BuildContext context, Customer customer, Branch branch) {
  void go(BuildContext sheetContext, Future<void> Function() action) {
    Navigator.pop(sheetContext);
    action();
  }

  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    builder: (sheetContext) => SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(color: BrandColors.aquaSoft, borderRadius: BorderRadius.circular(14)),
                  child: const Icon(Icons.storefront_rounded, color: BrandColors.navy),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(customer.name, style: Theme.of(sheetContext).textTheme.titleLarge?.copyWith(fontSize: 19)),
                      const SizedBox(height: 2),
                      Text(customer.document, style: const TextStyle(color: BrandColors.muted)),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 18),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(color: BrandColors.surface, borderRadius: BorderRadius.circular(14)),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Flexible(
                        child: Text(branch.name, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                      ),
                      if (branch.isMain) ...[
                        const SizedBox(width: 8),
                        const Pill(label: 'Principal', foreground: BrandColors.navy, background: BrandColors.aquaSoft),
                      ],
                    ],
                  ),
                  const SizedBox(height: 8),
                  InfoRow(
                    icon: Icons.place_outlined,
                    text: branch.fullAddress ?? 'Sin dirección',
                    muted: branch.fullAddress == null,
                  ),
                  InfoRow(
                    icon: Icons.phone_outlined,
                    text: branch.phone ?? customer.phone ?? 'Sin teléfono',
                    muted: branch.phone == null && customer.phone == null,
                  ),
                ],
              ),
            ),
            const SizedBox(height: 18),
            if (branch.hasLocation) ...[
              SizedBox(
                width: double.infinity,
                child: FilledButton.icon(
                  onPressed: () => go(sheetContext, () => showBranchOnMap(context, customer, branch)),
                  icon: const Icon(Icons.map_rounded),
                  label: const Text('Ver en el mapa'),
                ),
              ),
              const SizedBox(height: 10),
            ],
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () => go(sheetContext, () => startVisit(context, customer, branch)),
                    icon: const Icon(Icons.where_to_vote_rounded),
                    label: const Text('Registrar visita'),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () => go(sheetContext, () => startOrder(context, customer, branch)),
                    icon: const Icon(Icons.add_shopping_cart_rounded),
                    label: const Text('Tomar preventa'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    ),
  );
}
