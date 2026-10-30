import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../api/api_client.dart';
import '../../api/models.dart';
import '../../session/app_scope.dart';
import '../../ui/formatters.dart';
import '../../ui/theme.dart';
import '../../ui/widgets.dart';

/// Takes a sales order for a customer's branch (or keeps editing a draft): search a product, type the
/// quantity and it joins the order's list; delivery date and a delivery note.
class NewOrderScreen extends StatefulWidget {
  const NewOrderScreen({super.key, required this.customer, required this.branch, this.visitId, this.draft});

  final Customer customer;
  final Branch branch;

  /// The visit during which the order is taken, if any.
  final String? visitId;

  /// A saved draft to keep editing.
  final SalesOrder? draft;

  @override
  State<NewOrderScreen> createState() => _NewOrderScreenState();
}

class _NewOrderScreenState extends State<NewOrderScreen> {
  final _search = TextEditingController();
  final _searchFocus = FocusNode();
  final _notes = TextEditingController();

  /// Product id → units, in the order they were added.
  final Map<String, int> _quantities = {};
  late Branch _branch = widget.branch;
  late DateTime _delivery = dateOnly(DateTime.now()).add(const Duration(days: 7));
  String? _draftId;

  List<Product>? _products;
  String? _productsError;
  bool _saving = false;
  SalesOrder? _saved;
  String? _confirmError;

  @override
  void initState() {
    super.initState();
    final draft = widget.draft;
    if (draft != null) {
      _draftId = draft.id;
      _notes.text = draft.notes ?? '';
      _delivery = parseIsoDate(draft.estimatedDeliveryDate) ?? _delivery;
      for (final line in draft.lines) {
        _quantities[line.productId] = parseDecimal(line.quantity).round();
      }
    }
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadProducts());
  }

  @override
  void dispose() {
    _search.dispose();
    _searchFocus.dispose();
    _notes.dispose();
    super.dispose();
  }

  List<Branch> get _branches {
    final active = widget.customer.activeBranches;
    return active.any((b) => b.id == widget.branch.id) ? active : [widget.branch, ...active];
  }

  Map<String, Product> get _byId => {for (final product in _products ?? const <Product>[]) product.id: product};

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
      helpText: 'Fecha de entrega',
    );
    if (picked != null) setState(() => _delivery = picked);
  }

  /// Asks the quantity of a product and puts it in the order (0 removes it).
  Future<void> _askQuantity(Product product) async {
    final quantity = await showDialog<int>(
      context: context,
      builder: (_) => _QuantityDialog(product: product, initial: _quantities[product.id]),
    );
    if (quantity == null || !mounted) return;
    setState(() {
      if (quantity <= 0) {
        _quantities.remove(product.id);
      } else {
        _quantities[product.id] = quantity;
      }
      _search.clear();
    });
  }

  int get _totalUnits => _quantities.values.fold(0, (sum, value) => sum + value);

  Future<void> _save({required bool confirm}) async {
    if (_saving) return;
    if (_quantities.isEmpty) {
      showMessage(context, 'Agrega al menos un producto.');
      return;
    }
    FocusScope.of(context).unfocus();
    setState(() => _saving = true);
    final scope = AppScope.of(context);
    try {
      var order = await scope.api.saveOrder(
        draftId: _draftId,
        customerId: widget.customer.id,
        branchId: _branch.id,
        visitId: widget.visitId,
        estimatedDeliveryDate: isoDate(_delivery),
        notes: _notes.text,
        quantities: Map.of(_quantities),
      );
      _draftId = order.id;
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
          _saved = order;
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
    final saved = _saved;
    final title = widget.draft == null ? 'Nueva preventa' : 'Borrador ${widget.draft!.label}';
    return Scaffold(
      appBar: AppBar(title: Text(saved == null ? title : saved.label)),
      body: saved == null ? _buildForm(context) : _OrderDone(order: saved, confirmError: _confirmError),
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
              SectionLabel('PRODUCTOS', trailing: count == 0 ? null : '$count en el pedido'),
              _buildSearch(),
              _buildMatches(),
              const SizedBox(height: 10),
              _buildOrderLines(),
              const SectionLabel('NOTA (OPCIONAL)'),
              TextField(
                controller: _notes,
                maxLines: 3,
                minLines: 2,
                maxLength: 500,
                textCapitalization: TextCapitalization.sentences,
                decoration: const InputDecoration(
                  hintText: 'Ej.: entrar por la calle 41, portón verde al lado de la droguería.',
                ),
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
                label: const Text('Guardar preventa'),
              ),
              const SizedBox(height: 4),
              TextButton(
                onPressed: _saving ? null : () => _save(confirm: false),
                child: const Text('Guardar como borrador'),
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
              title: const Text('Fecha de entrega', style: TextStyle(fontSize: 13, color: BrandColors.muted)),
              subtitle: Text(
                formatLongDate(_delivery),
                style: const TextStyle(fontWeight: FontWeight.w700, color: BrandColors.ink, fontSize: 15),
              ),
              trailing: const Text(
                'Cambiar',
                style: TextStyle(color: BrandColors.navy, fontWeight: FontWeight.w700),
              ),
              onTap: _pickDate,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSearch() {
    return TextField(
      controller: _search,
      focusNode: _searchFocus,
      onChanged: (_) => setState(() {}),
      textInputAction: TextInputAction.search,
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
    );
  }

  /// Products matching the search (only while typing, so a long catalog never fills the screen).
  Widget _buildMatches() {
    final products = _products;
    if (_productsError != null && products == null) {
      return Padding(
        padding: const EdgeInsets.only(top: 10),
        child: MessageView.error(_productsError!, onRetry: _loadProducts),
      );
    }
    final words = _search.text.trim().toLowerCase().split(RegExp(r'\s+')).where((w) => w.isNotEmpty).toList();
    if (words.isEmpty) return const SizedBox.shrink();
    if (products == null) {
      return const Padding(
        padding: EdgeInsets.all(20),
        child: LoadingView(label: 'Cargando productos…'),
      );
    }
    final matches = products
        .where((p) => words.every((w) => '${p.code} ${p.name}'.toLowerCase().contains(w)))
        .take(8)
        .toList();
    return Card(
      margin: const EdgeInsets.only(top: 6),
      clipBehavior: Clip.antiAlias,
      child: matches.isEmpty
          ? const Padding(
              padding: EdgeInsets.all(16),
              child: Text(
                'Sin resultados',
                textAlign: TextAlign.center,
                style: TextStyle(color: BrandColors.muted),
              ),
            )
          : Column(
              children: [
                for (var i = 0; i < matches.length; i++) ...[
                  if (i > 0) const Divider(height: 1, indent: 16, endIndent: 16),
                  ListTile(
                    dense: true,
                    title: Text(matches[i].name, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                    subtitle: Text('${matches[i].code} · ${unitLabel(matches[i].stockUnit)}'),
                    trailing: _quantities.containsKey(matches[i].id)
                        ? Pill(
                            label: '${formatNumber(_quantities[matches[i].id]!)} und.',
                            foreground: BrandColors.navy,
                            background: BrandColors.aquaSoft,
                          )
                        : const Icon(Icons.add_circle_outline_rounded, color: BrandColors.navy),
                    onTap: () => _askQuantity(matches[i]),
                  ),
                ],
              ],
            ),
    );
  }

  /// What is already in the order: the last one added first; tap to change the quantity.
  Widget _buildOrderLines() {
    if (_quantities.isEmpty) return const SizedBox.shrink();
    final byId = _byId;
    final ids = _quantities.keys.toList().reversed.toList();
    return Card(
      clipBehavior: Clip.antiAlias,
      child: Column(
        children: [
          for (var i = 0; i < ids.length; i++) ...[
            if (i > 0) const Divider(height: 1, indent: 16, endIndent: 16),
            _OrderLineRow(
              key: ValueKey(ids[i]),
              product: byId[ids[i]],
              productId: ids[i],
              draftLine: widget.draft?.lines.where((l) => l.productId == ids[i]).firstOrNull,
              quantity: _quantities[ids[i]]!,
              onTap: byId[ids[i]] == null ? null : () => _askQuantity(byId[ids[i]]!),
              onRemove: () => setState(() => _quantities.remove(ids[i])),
            ),
          ],
        ],
      ),
    );
  }
}

class _OrderLineRow extends StatelessWidget {
  const _OrderLineRow({
    super.key,
    required this.product,
    required this.productId,
    required this.draftLine,
    required this.quantity,
    required this.onTap,
    required this.onRemove,
  });

  final Product? product;
  final String productId;
  final OrderLine? draftLine;
  final int quantity;
  final VoidCallback? onTap;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final name = product?.name ?? draftLine?.productName ?? '';
    final code = product?.code ?? draftLine?.productCode ?? '';
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 10, 4, 10),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(name, style: const TextStyle(fontWeight: FontWeight.w600)),
                  Text(code, style: const TextStyle(color: BrandColors.muted, fontSize: 12)),
                ],
              ),
            ),
            Text(
              '${formatNumber(quantity)} und.',
              style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15, color: BrandColors.navy),
            ),
            IconButton(
              tooltip: 'Quitar',
              onPressed: onRemove,
              icon: const Icon(Icons.close_rounded, color: BrandColors.muted),
            ),
          ],
        ),
      ),
    );
  }
}

/// Quantity of one product: numeric keyboard open right away, Enter adds it.
class _QuantityDialog extends StatefulWidget {
  const _QuantityDialog({required this.product, required this.initial});

  final Product product;
  final int? initial;

  @override
  State<_QuantityDialog> createState() => _QuantityDialogState();
}

class _QuantityDialogState extends State<_QuantityDialog> {
  late final TextEditingController _controller = TextEditingController(text: widget.initial?.toString() ?? '');

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _submit() {
    final value = int.tryParse(_controller.text) ?? 0;
    if (value <= 0 && widget.initial == null) return;
    Navigator.pop(context, value);
  }

  @override
  Widget build(BuildContext context) {
    final editing = widget.initial != null;
    return AlertDialog(
      title: Text(widget.product.name, style: const TextStyle(fontSize: 17)),
      content: TextField(
        controller: _controller,
        autofocus: true,
        keyboardType: TextInputType.number,
        textInputAction: TextInputAction.done,
        inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(6)],
        style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800),
        decoration: InputDecoration(labelText: 'Cantidad', suffixText: unitLabel(widget.product.stockUnit)),
        onSubmitted: (_) => _submit(),
      ),
      actions: [
        if (editing)
          TextButton(
            onPressed: () => Navigator.pop(context, 0),
            style: TextButton.styleFrom(foregroundColor: BrandColors.danger),
            child: const Text('Quitar'),
          ),
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancelar')),
        FilledButton(onPressed: _submit, child: Text(editing ? 'Cambiar' : 'Agregar')),
      ],
    );
  }
}

class _OrderDone extends StatelessWidget {
  const _OrderDone({required this.order, required this.confirmError});

  final SalesOrder order;
  final String? confirmError;

  @override
  Widget build(BuildContext context) {
    final saved = !order.isDraft;
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
                    color: saved ? BrandColors.successSoft : BrandColors.neutralSoft,
                    shape: BoxShape.circle,
                  ),
                  child: Icon(
                    saved ? Icons.check_circle_rounded : Icons.edit_note_rounded,
                    size: 52,
                    color: saved ? BrandColors.success : BrandColors.navy,
                  ),
                ),
              ),
              const SizedBox(height: 20),
              Text(
                saved ? 'Preventa ${order.label} guardada' : 'Borrador ${order.label} guardado',
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800),
              ),
              if (confirmError != null) ...[
                const SizedBox(height: 14),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(color: BrandColors.warningSoft, borderRadius: BorderRadius.circular(12)),
                  child: Text(
                    'Quedó como borrador: $confirmError',
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
                        text: delivery == null ? 'Sin fecha de entrega' : 'Entrega: ${formatLongDate(delivery)}',
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
                            const Expanded(
                              child: Text('Total', style: TextStyle(fontWeight: FontWeight.w800)),
                            ),
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
