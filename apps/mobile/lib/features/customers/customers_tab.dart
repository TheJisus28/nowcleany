import 'dart:async';

import 'package:flutter/material.dart';

import '../../api/api_client.dart';
import '../../api/models.dart';
import '../../session/app_scope.dart';
import '../../ui/theme.dart';
import '../../ui/widgets.dart';
import 'branch_actions.dart';

class CustomersTab extends StatefulWidget {
  const CustomersTab({super.key});

  @override
  State<CustomersTab> createState() => _CustomersTabState();
}

class _CustomersTabState extends State<CustomersTab> with AutomaticKeepAliveClientMixin {
  final _search = TextEditingController();
  Timer? _debounce;
  List<Customer>? _customers;
  String? _error;
  bool _loading = true;
  int _request = 0;

  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _search.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final request = ++_request;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final customers = await AppScope.of(context).api.customers(search: _search.text);
      if (!mounted || request != _request) return;
      setState(() => _customers = customers);
    } on ApiException catch (error) {
      if (!mounted || request != _request) return;
      setState(() => _error = error.message);
    } finally {
      if (mounted && request == _request) setState(() => _loading = false);
    }
  }

  void _onSearchChanged(String _) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), _load);
    setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    return Column(
      children: [
        Container(
          color: BrandColors.navy,
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
          child: TextField(
            controller: _search,
            onChanged: _onSearchChanged,
            textInputAction: TextInputAction.search,
            decoration: InputDecoration(
              hintText: 'Buscar por nombre, NIT o cédula',
              prefixIcon: const Icon(Icons.search_rounded),
              suffixIcon: _search.text.isEmpty
                  ? null
                  : IconButton(
                      tooltip: 'Limpiar',
                      icon: const Icon(Icons.close_rounded),
                      onPressed: () {
                        _search.clear();
                        _onSearchChanged('');
                      },
                    ),
              enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
            ),
          ),
        ),
        Expanded(child: _buildBody()),
      ],
    );
  }

  Widget _buildBody() {
    final customers = _customers;
    if (_loading && customers == null) return const LoadingView(label: 'Cargando tu cartera…');
    if (_error != null && customers == null) return MessageView.error(_error!, onRetry: _load);
    if (customers == null) return const SizedBox.shrink();

    final searching = _search.text.trim().isNotEmpty;
    return RefreshIndicator(
      onRefresh: _load,
      child: customers.isEmpty
          ? ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              children: [
                const SizedBox(height: 60),
                MessageView(
                  icon: searching ? Icons.search_off_rounded : Icons.storefront_outlined,
                  title: searching ? 'Sin resultados' : 'Aún no tienes clientes',
                  message: searching
                      ? 'No hay clientes de tu cartera que coincidan con «${_search.text.trim()}».'
                      : 'Cuando gerencia te asigne clientes, aparecerán aquí con sus sucursales.',
                ),
              ],
            )
          : ListView.separated(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
              itemCount: customers.length + 1,
              separatorBuilder: (_, index) => SizedBox(height: index == 0 ? 0 : 12),
              itemBuilder: (context, index) {
                if (index == 0) {
                  return Padding(
                    padding: const EdgeInsets.fromLTRB(4, 0, 4, 12),
                    child: Row(
                      children: [
                        Text(
                          customers.length == 1 ? '1 cliente' : '${customers.length} clientes',
                          style: const TextStyle(color: BrandColors.muted, fontWeight: FontWeight.w600),
                        ),
                        const Spacer(),
                        if (_loading)
                          const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)),
                      ],
                    ),
                  );
                }
                return CustomerCard(customer: customers[index - 1]);
              },
            ),
    );
  }
}

class CustomerCard extends StatelessWidget {
  const CustomerCard({super.key, required this.customer});

  final Customer customer;

  @override
  Widget build(BuildContext context) {
    final branches = customer.activeBranches;
    return Card(
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          InkWell(
            onTap: branches.isEmpty
                ? null
                : () => showBranchSheet(
                    context,
                    customer,
                    branches.firstWhere((b) => b.isMain, orElse: () => branches.first),
                  ),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 12),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  CircleAvatar(
                    radius: 22,
                    backgroundColor: BrandColors.navy,
                    child: Text(
                      _initial(customer.name),
                      style: const TextStyle(color: BrandColors.aqua, fontWeight: FontWeight.w800, fontSize: 17),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(customer.name, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                        const SizedBox(height: 2),
                        Text(customer.document, style: const TextStyle(color: BrandColors.muted, fontSize: 13)),
                        if (customer.city != null)
                          Text(customer.city!, style: const TextStyle(color: BrandColors.muted, fontSize: 13)),
                      ],
                    ),
                  ),
                  const Icon(Icons.chevron_right_rounded, color: BrandColors.muted),
                ],
              ),
            ),
          ),
          const Divider(),
          if (branches.isEmpty)
            const Padding(
              padding: EdgeInsets.all(16),
              child: Text('Sin sucursales activas.', style: TextStyle(color: BrandColors.muted)),
            ),
          for (var i = 0; i < branches.length; i++) ...[
            if (i > 0) const Divider(indent: 16, endIndent: 16),
            _BranchRow(customer: customer, branch: branches[i]),
          ],
        ],
      ),
    );
  }

  static String _initial(String name) => name.trim().isEmpty ? '?' : name.trim()[0].toUpperCase();
}

class _BranchRow extends StatelessWidget {
  const _BranchRow({required this.customer, required this.branch});

  final Customer customer;
  final Branch branch;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: () => showBranchSheet(context, customer, branch),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 8, 12),
        child: Row(
          children: [
            Icon(
              branch.hasLocation ? Icons.location_on_rounded : Icons.location_off_outlined,
              color: branch.hasLocation ? BrandColors.navy : BrandColors.muted,
              size: 22,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Flexible(
                        child: Text(branch.name, style: const TextStyle(fontWeight: FontWeight.w600)),
                      ),
                      if (branch.isMain) ...[
                        const SizedBox(width: 6),
                        const Pill(label: 'Principal', foreground: BrandColors.navy, background: BrandColors.aquaSoft),
                      ],
                    ],
                  ),
                  if (branch.fullAddress != null)
                    Text(branch.fullAddress!, style: const TextStyle(color: BrandColors.muted, fontSize: 13)),
                ],
              ),
            ),
            if (branch.hasLocation)
              IconButton(
                tooltip: 'Ver en el mapa',
                onPressed: () => showBranchOnMap(context, customer, branch),
                icon: const Icon(Icons.map_outlined, color: BrandColors.navy),
              ),
            IconButton(
              tooltip: 'Registrar visita',
              onPressed: () => startVisit(context, customer, branch),
              icon: const Icon(Icons.where_to_vote_outlined, color: BrandColors.navy),
            ),
            IconButton(
              tooltip: 'Tomar preventa',
              onPressed: () => startOrder(context, customer, branch),
              icon: const Icon(Icons.add_shopping_cart_rounded, color: BrandColors.navy),
            ),
          ],
        ),
      ),
    );
  }
}
