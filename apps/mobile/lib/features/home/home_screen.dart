import 'package:flutter/material.dart';

import '../../session/app_scope.dart';
import '../../ui/theme.dart';
import '../customers/customers_tab.dart';
import '../map/map_tab.dart';
import '../orders/orders_tab.dart';
import '../visits/visits_tab.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int _index = 0;

  /// Tabs are built the first time they are opened, then kept alive.
  final Set<int> _opened = {0};

  static const _titles = ['Mapa de mi cartera', 'Mis clientes', 'Mis visitas', 'Mis preventas'];

  Future<void> _confirmLogout() async {
    final session = AppScope.of(context).session;
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Cerrar sesión'),
        content: const Text('¿Quieres cerrar tu sesión en este celular?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancelar')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Cerrar sesión')),
        ],
      ),
    );
    if (ok == true) await session.logout();
  }

  @override
  Widget build(BuildContext context) {
    final user = AppScope.of(context).session.user;
    return Scaffold(
      appBar: AppBar(
        title: Text(_titles[_index]),
        actions: [
          PopupMenuButton<String>(
            tooltip: 'Mi cuenta',
            position: PopupMenuPosition.under,
            offset: const Offset(0, 8),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
            onSelected: (value) {
              if (value == 'logout') _confirmLogout();
            },
            itemBuilder: (context) => [
              PopupMenuItem<String>(
                enabled: false,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      user?.fullName ?? '',
                      style: const TextStyle(fontWeight: FontWeight.w700, color: BrandColors.ink),
                    ),
                    Text(user?.email ?? '', style: const TextStyle(fontSize: 12, color: BrandColors.muted)),
                  ],
                ),
              ),
              const PopupMenuDivider(),
              const PopupMenuItem<String>(
                value: 'logout',
                child: Row(
                  children: [
                    Icon(Icons.logout_rounded, color: BrandColors.danger, size: 20),
                    SizedBox(width: 12),
                    Text('Cerrar sesión', style: TextStyle(color: BrandColors.danger, fontWeight: FontWeight.w600)),
                  ],
                ),
              ),
            ],
            child: Padding(
              padding: const EdgeInsets.only(right: 14),
              child: CircleAvatar(
                radius: 18,
                backgroundColor: BrandColors.aqua,
                child: Text(
                  user?.initials ?? '?',
                  style: const TextStyle(color: BrandColors.navy, fontWeight: FontWeight.w800, fontSize: 14),
                ),
              ),
            ),
          ),
        ],
      ),
      body: IndexedStack(
        index: _index,
        children: [
          _opened.contains(0) ? const MapTab() : const SizedBox.shrink(),
          _opened.contains(1) ? const CustomersTab() : const SizedBox.shrink(),
          _opened.contains(2) ? const VisitsTab() : const SizedBox.shrink(),
          _opened.contains(3) ? const OrdersTab() : const SizedBox.shrink(),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (index) => setState(() {
          _index = index;
          _opened.add(index);
        }),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.map_outlined), selectedIcon: Icon(Icons.map_rounded), label: 'Mapa'),
          NavigationDestination(
            icon: Icon(Icons.storefront_outlined),
            selectedIcon: Icon(Icons.storefront_rounded),
            label: 'Clientes',
          ),
          NavigationDestination(
            icon: Icon(Icons.where_to_vote_outlined),
            selectedIcon: Icon(Icons.where_to_vote_rounded),
            label: 'Visitas',
          ),
          NavigationDestination(
            icon: Icon(Icons.receipt_long_outlined),
            selectedIcon: Icon(Icons.receipt_long_rounded),
            label: 'Preventas',
          ),
        ],
      ),
    );
  }
}
