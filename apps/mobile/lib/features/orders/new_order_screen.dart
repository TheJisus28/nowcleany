import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../api/api_client.dart';
import '../../api/models.dart';
import '../../session/app_scope.dart';
import '../../ui/formatters.dart';
import '../../ui/theme.dart';
import '../../ui/widgets.dart';

/// Takes a sales order for a customer's branch: finished goods with quantities, delivery date and notes.
class NewOrderScreen extends StatefulWidget {
  const NewOrderScreen({super.key, required this.customer, required this.branch, this.visitId});

  final Customer customer;
  final Branch branch;

  /// The visit during which the order is taken, if any.
  final String? visitId;

  @override
  State<NewOrderScreen> createState() => _NewOrderScreenState();
}

class _NewOrderScreenState extends State<NewOrderScreen> {
  final _search = TextEditingController();
  final _notes = TextEditingController();
  final Map<String, int> _quantities = {};
  late Branch _branch = widget.branch;
  late DateTime _delivery = dateOnly(DateTime.now()).add(const Duration(days: 7));

  List<Product>? _products;
  String? _productsError;
  bool _saving = false;
  SalesOrder? _created;
  String? _confirmError;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadProducts());
  }

  @override
  void dispose() {
    _search.dispose();
    _notes.dispose();
    super.dispose();
  }

  List<Branch> get _branches {
    final active = widget.customer.activeBranches;
    return active.any((b) => b.id == widget.branch.id) ? active : [widget.branch, ...active];
  }

  Future<void> _loadProducts() async {
    setState(() => _productsError = null);
    try {
      final products = await AppScope.of(context).api.finishedProducts();
      if (mounted) setState(() => _products = products);
    } on ApiException catch (error) {
      if (mounted) setState(() => _productsError = error.message);
    }
  }

  Future<void> _pickDate() async {
    final today = dateOnly(DateTime.now());
    final picked = await showDatePicker(
      context: context,
      initialDate: _delivery.isBefore(today) ? today : _delivery,
      firstDate: today,
      lastDate: today.add(const Duration(days: 365)),
      helpText: 'Fecha prometida al cliente',
    );
    if (picked != null) setState(() => _delivery = picked);
  }

  void _setQuantity(String productId, int value) {
    setState(() {
      if (value <= 0) {
        _quantities.remove(productId);
      } else {
        _quantities[productId] = value;
      }
    });
  }

  int get _totalUnits => _quantities.values.fold(0, (sum, value) => sum + value);

  Future<void> _save({required bool confirm}) async {
    if (_saving) return;
    if (_quantities.isEmpty) {
      showMessage(context, 'Agrega al menos un producto con su cantidad.');
      return;
    }
    FocusScope.of(context).unfocus();
    setState(() => _saving = true);
    final scope = AppScope.of(context);
    try {
      var order = await scope.api.createOrder(
        customerId: widget.customer.id,
        branchId: _branch.id,
        visitId: widget.visitId,
        estimatedDeliveryDate: isoDate(_delivery),
        notes: _notes.text,
        quantities: Map.of(_quantities),
      );
      String? confirmError;
      if (confirm) {
        try {
          order = await scope.api.confirmOrder(order.id);
        } on ApiException catch (error) {
          confirmError = error.message;
        }
      }
      scope.events.changed();
      if (mounted) {
        setState(() {
          _created = order;
          _confirmError = confirmError;
        });
      }
    } on ApiException catch (error) {
      if (mounted) showMessage(context, error.message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final created = _created;
    return Scaffold(
      appBar: AppBar(title: Text(created == null ? 'Tomar preventa' : created.label)),
      body: created == null ? _buildForm(context) : _OrderDone(order: created, confirmError: _confirmError),
    );
  }

  Widget _buildForm(BuildContext context) {
    final count = _quantities.length;
    return Column(
      children: [
        Expanded(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
            keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
            children: [
              _buildCustomerCard(),
              const SectionLabel('ENTREGA'),
              _buildDeliveryCard(),
              SectionLabel('PRODUCTOS', trailing: count == 0 ? null : '$count seleccionados'),
              TextField(
                controller: _search,
                onChanged: (_) => setState(() {}),
                decoration: InputDecoration(
                  hintText: 'Buscar producto por nombre o código',
                  prefixIcon: const Icon(Icons.search_rounded),
                  suffixIcon: _search.text.isEmpty
                      ? null
                      : IconButton(
                          tooltip: 'Limpiar',
                          icon: const Icon(Icons.close_rounded),
                          onPressed: () => setState(_search.clear),
                        ),
                ),
              ),
              const SizedBox(height: 10),
              _buildProducts(),
              const SectionLabel('NOTAS (OPCIONAL)'),
              TextField(
                controller: _notes,
                maxLines: 3,
                minLines: 2,
                maxLength: 500,
                textCapitalization: TextCapitalization.sentences,
                decoration: const InputDecoration(hintText: 'Ej.: entregar en la mañana; recibe la señora Marta.'),
              ),
            ],
          ),
        ),
        BottomActionBar(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  Text(
                    count == 0 ? 'Sin productos' : (count == 1 ? '1 producto' : '$count productos'),
                    style: const TextStyle(color: BrandColors.muted, fontWeight: FontWeight.w600),
                  ),
                  const Spacer(),
                  Text(
                    '${formatNumber(_totalUnits)} und.',
                    style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18, color: BrandColors.navy),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              FilledButton.icon(
                onPressed: _saving ? null : () => _save(confirm: true),
                icon: _saving
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white),
                      )
                    : const Icon(Icons.check_rounded),
                label: const Text('Enviar al consolidado'),
              ),
              const SizedBox(height: 4),
              TextButton(
                onPressed: _saving ? null : () => _save(confirm: false),
                child: const Text('Guardar borrador'),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildCustomerCard() {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(color: BrandColors.aquaSoft, borderRadius: BorderRadius.circular(12)),
              child: const Icon(Icons.storefront_rounded, color: BrandColors.navy),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(widget.customer.name, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                  Text(widget.customer.document, style: const TextStyle(color: BrandColors.muted, fontSize: 13)),
                ],
              ),
            ),
            if (widget.visitId != null)
              const Pill(
                icon: Icons.where_to_vote_rounded,
                label: 'En visita',
                foreground: BrandColors.success,
                background: BrandColors.successSoft,
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildDeliveryCard() {
    final branches = _branches;
    return Card(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 8),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (branches.length > 1)
              DropdownButtonFormField<String>(
                initialValue: _branch.id,
                isExpanded: true,
                decoration: const InputDecoration(
                  labelText: 'Sucursal de entrega',
                  prefixIcon: Icon(Icons.storefront_outlined),
                ),
                items: [
                  for (final branch in branches)
                    DropdownMenuItem(
                      value: branch.id,
                      child: Text(branch.name, overflow: TextOverflow.ellipsis),
                    ),
                ],
                onChanged: (id) {
                  if (id == null) return;
                  setState(() => _branch = branches.firstWhere((b) => b.id == id));
                },
              )
            else
              InfoRow(icon: Icons.storefront_outlined, text: _branch.name),
            if (_branch.fullAddress != null)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: InfoRow(icon: Icons.place_outlined, text: _branch.fullAddress!, muted: true),
              ),
            const SizedBox(height: 4),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.event_rounded, color: BrandColors.navy),
              title: const Text('Fecha prometida al cliente', style: TextStyle(fontSize: 13, color: BrandColors.muted)),
              subtitle: Text(
                formatLongDate(_delivery),
                style: const TextStyle(fontWeight: FontWeight.w700, color: BrandColors.ink, fontSize: 15),
              ),
              trailing: const Text('Cambiar', style: TextStyle(color: BrandColors.navy, fontWeight: FontWeight.w700)),
              onTap: _pickDate,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildProducts() {
    final products = _products;
    if (_productsError != null && products == null) {
      return Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            children: [
              Text(_productsError!, textAlign: TextAlign.center, style: const TextStyle(color: BrandColors.danger)),
              const SizedBox(height: 10),
              OutlinedButton.icon(
                onPressed: _loadProducts,
                icon: const Icon(Icons.refresh_rounded),
                label: const Text('Reintentar'),
              ),
            ],
          ),
        ),
      );
    }
    if (products == null) {
      return const Padding(padding: EdgeInsets.all(28), child: LoadingView(label: 'Cargando productos…'));
    }
    final query = _search.text.trim().toLowerCase();
    final visible = query.isEmpty
        ? products
        : products.where((p) => p.name.toLowerCase().contains(query) || p.code.toLowerCase().contains(query)).toList();
    if (visible.isEmpty) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 24),
        child: Text(
          products.isEmpty ? 'No hay productos terminados activos.' : 'Ningún producto coincide con «${_search.text.trim()}».',
          textAlign: TextAlign.center,
          style: const TextStyle(color: BrandColors.muted),
        ),
      );
    }
    return Card(
      clipBehavior: Clip.antiAlias,
      child: Column(
        children: [
          for (var i = 0; i < visible.length; i++) ...[
            if (i > 0) const Divider(indent: 16, endIndent: 16),
            _ProductRow(
              key: ValueKey(visible[i].id),
              product: visible[i],
              quantity: _quantities[visible[i].id] ?? 0,
              onChanged: (value) => _setQuantity(visible[i].id, value),
            ),
          ],
        ],
      ),
    );
  }
}

class _ProductRow extends StatelessWidget {
  const _ProductRow({super.key, required this.product, required this.quantity, required this.onChanged});

  final Product product;
  final int quantity;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    final selected = quantity > 0;
    return Container(
      color: selected ? BrandColors.aquaSoft.withValues(alpha: 0.5) : null,
      padding: const EdgeInsets.fromLTRB(16, 10, 8, 10),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(product.name, style: TextStyle(fontWeight: selected ? FontWeight.w700 : FontWeight.w600)),
                Text(
                  '${product.code} · ${unitLabel(product.stockUnit)}',
                  style: const TextStyle(color: BrandColors.muted, fontSize: 12),
                ),
              ],
            ),
          ),
          _QuantityStepper(value: quantity, onChanged: onChanged),
        ],
      ),
    );
  }
}

/// − [n] + with direct typing (whole units).
class _QuantityStepper extends StatefulWidget {
  const _QuantityStepper({required this.value, required this.onChanged});

  final int value;
  final ValueChanged<int> onChanged;

  @override
  State<_QuantityStepper> createState() => _QuantityStepperState();
}

class _QuantityStepperState extends State<_QuantityStepper> {
  late final TextEditingController _controller = TextEditingController(text: _text(widget.value));

  static String _text(int value) => value == 0 ? '' : value.toString();

  @override
  void didUpdateWidget(_QuantityStepper oldWidget) {
    super.didUpdateWidget(oldWidget);
    final current = int.tryParse(_controller.text) ?? 0;
    if (current != widget.value) _controller.text = _text(widget.value);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        _StepButton(
          icon: Icons.remove_rounded,
          onPressed: widget.value > 0 ? () => widget.onChanged(widget.value - 1) : null,
        ),
        SizedBox(
          width: 58,
          child: TextField(
            controller: _controller,
            textAlign: TextAlign.center,
            keyboardType: TextInputType.number,
            inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(6)],
            style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15),
            decoration: const InputDecoration(
              hintText: '0',
              isDense: true,
              contentPadding: EdgeInsets.symmetric(horizontal: 4, vertical: 10),
            ),
            onChanged: (text) => widget.onChanged(int.tryParse(text) ?? 0),
          ),
        ),
        _StepButton(icon: Icons.add_rounded, onPressed: () => widget.onChanged(widget.value + 1)),
      ],
    );
  }
}

class _StepButton extends StatelessWidget {
  const _StepButton({required this.icon, required this.onPressed});

  final IconData icon;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return IconButton(
      onPressed: onPressed,
      icon: Icon(icon),
      color: BrandColors.navy,
      visualDensity: VisualDensity.compact,
      style: IconButton.styleFrom(disabledForegroundColor: BrandColors.line),
    );
  }
}

class _OrderDone extends StatelessWidget {
  const _OrderDone({required this.order, required this.confirmError});

  final SalesOrder order;
  final String? confirmError;

  @override
  Widget build(BuildContext context) {
    final confirmed = order.status == 'CONFIRMED';
    final delivery = parseIsoDate(order.estimatedDeliveryDate);
    return Column(
      children: [
        Expanded(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 32, 20, 24),
            children: [
              Center(
                child: Container(
                  width: 96,
                  height: 96,
                  decoration: BoxDecoration(
                    color: confirmed ? BrandColors.successSoft : BrandColors.neutralSoft,
                    shape: BoxShape.circle,
                  ),
                  child: Icon(
                    confirmed ? Icons.check_circle_rounded : Icons.edit_note_rounded,
                    size: 52,
                    color: confirmed ? BrandColors.success : BrandColors.navy,
                  ),
                ),
              ),
              const SizedBox(height: 20),
              Text(
                confirmed ? 'Preventa ${order.label} enviada al consolidado' : 'Borrador ${order.label} guardado',
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 8),
              Text(
                confirmed
                    ? 'Planta y compras ya la ven en sus necesidades de producción y de compra.'
                    : 'Queda como borrador: puedes enviarla después desde Preventas.',
                textAlign: TextAlign.center,
                style: const TextStyle(color: BrandColors.muted, height: 1.45),
              ),
              if (confirmError != null) ...[
                const SizedBox(height: 14),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(color: BrandColors.warningSoft, borderRadius: BorderRadius.circular(12)),
                  child: Text(
                    'No se pudo enviar: $confirmError',
                    style: const TextStyle(color: BrandColors.warning, fontWeight: FontWeight.w600),
                  ),
                ),
              ],
              const SizedBox(height: 24),
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(order.customerName, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                      if (order.branchName != null) InfoRow(icon: Icons.storefront_outlined, text: order.branchName!),
                      InfoRow(
                        icon: Icons.local_shipping_outlined,
                        text: delivery == null ? 'Sin fecha de entrega' : 'Entrega estimada: ${formatLongDate(delivery)}',
                      ),
                      const SizedBox(height: 8),
                      const Divider(),
                      for (final line in order.lines)
                        Padding(
                          padding: const EdgeInsets.symmetric(vertical: 6),
                          child: Row(
                            children: [
                              Expanded(child: Text(line.productName)),
                              Text(
                                '${formatNumber(parseDecimal(line.quantity))} ${unitLabel(line.unit)}',
                                style: const TextStyle(fontWeight: FontWeight.w700),
                              ),
                            ],
                          ),
                        ),
                      const Divider(),
                      Padding(
                        padding: const EdgeInsets.only(top: 8),
                        child: Row(
                          children: [
                            const Expanded(child: Text('Total', style: TextStyle(fontWeight: FontWeight.w800))),
                            Text(
                              '${formatNumber(order.totalUnits)} und.',
                              style: const TextStyle(fontWeight: FontWeight.w800, color: BrandColors.navy),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
        BottomActionBar(
          child: FilledButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Listo')),
        ),
      ],
    );
  }
}
