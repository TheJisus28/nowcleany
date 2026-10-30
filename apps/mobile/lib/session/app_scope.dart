import 'package:flutter/widgets.dart';

import '../api/sellers_api.dart';
import 'session.dart';

/// Tells the lists that something changed (a visit or an order was registered) so they reload.
class DataEvents extends ChangeNotifier {
  void changed() => notifyListeners();
}

/// The session, the API and the data events, reachable from any screen.
class AppScope extends InheritedWidget {
  const AppScope({super.key, required this.session, required this.api, required this.events, required super.child});

  final Session session;
  final SellersApi api;
  final DataEvents events;

  static AppScope of(BuildContext context) {
    final scope = context.getInheritedWidgetOfExactType<AppScope>();
    assert(scope != null, 'AppScope not found');
    return scope!;
  }

  @override
  bool updateShouldNotify(AppScope oldWidget) =>
      session != oldWidget.session || api != oldWidget.api || events != oldWidget.events;
}
