import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import 'api/api_client.dart';
import 'api/sellers_api.dart';
import 'config.dart';
import 'features/home/home_screen.dart';
import 'features/login/login_screen.dart';
import 'session/app_scope.dart';
import 'session/session.dart';
import 'ui/theme.dart';
import 'ui/widgets.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  final client = ApiClient(baseUrl: AppConfig.apiBaseUrl);
  final session = Session(client)..restore();
  runApp(SellersApp(session: session, api: SellersApi(client), events: DataEvents()));
}

class SellersApp extends StatefulWidget {
  const SellersApp({super.key, required this.session, required this.api, required this.events});

  final Session session;
  final SellersApi api;
  final DataEvents events;

  @override
  State<SellersApp> createState() => _SellersAppState();
}

class _SellersAppState extends State<SellersApp> {
  final _navigatorKey = GlobalKey<NavigatorState>();
  SessionStatus? _lastStatus;

  @override
  void initState() {
    super.initState();
    widget.session.addListener(_onSessionChanged);
  }

  @override
  void dispose() {
    widget.session.removeListener(_onSessionChanged);
    super.dispose();
  }

  /// On sign-out (or an expired session) drop any screen left on top of the home.
  void _onSessionChanged() {
    final status = widget.session.status;
    if (status == SessionStatus.signedOut && _lastStatus == SessionStatus.signedIn) {
      _navigatorKey.currentState?.popUntil((route) => route.isFirst);
      widget.api.clearCache();
    }
    _lastStatus = status;
  }

  @override
  Widget build(BuildContext context) {
    final session = widget.session;
    return AppScope(
      session: session,
      api: widget.api,
      events: widget.events,
      child: MaterialApp(
        title: 'NOW CLEANY Ventas',
        debugShowCheckedModeBanner: false,
        navigatorKey: _navigatorKey,
        theme: buildTheme(),
        locale: const Locale('es', 'CO'),
        supportedLocales: const [Locale('es', 'CO'), Locale('es')],
        localizationsDelegates: const [
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        home: ListenableBuilder(
          listenable: session,
          builder: (context, _) => switch (session.status) {
            SessionStatus.restoring => const _Splash(),
            SessionStatus.signedOut => const LoginScreen(),
            SessionStatus.signedIn => HomeScreen(key: ValueKey(session.user?.id)),
          },
        ),
      ),
    );
  }
}

class _Splash extends StatelessWidget {
  const _Splash();

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      backgroundColor: BrandColors.navy,
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            BrandMark(size: 52, subtitle: 'Ventas'),
            SizedBox(height: 36),
            SizedBox(
              width: 26,
              height: 26,
              child: CircularProgressIndicator(strokeWidth: 2.6, color: BrandColors.aqua),
            ),
          ],
        ),
      ),
    );
  }
}
