# NOW CLEANY Ventas (app móvil)

App Flutter para los vendedores de NOW CLEANY. Con su usuario (rol `sales`), el vendedor:

- ve en un **mapa** las sucursales de su cartera y su posición actual;
- busca sus **clientes** y sus sucursales;
- **registra la visita** con el GPS del celular: la API calcula la distancia a la sucursal y si fue en sitio;
- **toma la preventa** (productos terminados, cantidades, fecha estimada de entrega y notas), como borrador o
  confirmada, ligada a la visita cuando la toma desde ella;
- revisa sus **visitas** de los últimos 7 días y sus **preventas**.

Solo entran usuarios con el permiso `visits:write`; a los demás la app les dice que es para vendedores.

## Requisitos

- Flutter 3.47 (en este equipo: `C:\Users\carra\fvm\default\bin\flutter`).
- La API corriendo (`pnpm api` en la raíz) con datos de demo (`pnpm db:showcase`).

## Cómo correrla

La dirección de la API se pasa al compilar con `--dart-define=API_BASE_URL=...`.

**Emulador de Android** (por defecto `http://10.0.2.2:3000`, que es el `127.0.0.1:3000` del computador):

```
flutter pub get
flutter run
```

**Celular físico** en la misma red Wi-Fi que el computador:

1. Arranca la API escuchando en todas las interfaces: `HTTP_HOST=0.0.0.0` en el `.env` de la raíz (por defecto
   escucha solo en `127.0.0.1` y el celular no la alcanza).
2. Busca la IP del computador en la red (`ipconfig`, p. ej. `192.168.1.20`) y permite el puerto 3000 en el
   firewall de Windows.
3. Corre la app con esa dirección:

```
flutter run --dart-define=API_BASE_URL=http://192.168.1.20:3000
```

La API local va por `http`, por eso Android tiene `usesCleartextTraffic` y iOS permite cargas sin TLS.

## Mapa (Mapbox)

La app **no** lleva el token de Mapbox. Después de iniciar sesión lo pide a la API (`GET /v1/maps/config`), que lo
toma de `MAPBOX_PUBLIC_TOKEN` en el `.env`. Si la API no tiene token, la pestaña Mapa muestra un aviso y las
sucursales en lista. Para compilar no hace falta token de descarga de Mapbox.

## Estructura

```
lib/
  main.dart          arranque, tema, idioma y puerta de sesión
  config.dart        API_BASE_URL
  api/               cliente HTTP (token, refresh ante 401, errores problem+json), modelos y endpoints
  session/           sesión (refresh token en shared_preferences) y AppScope
  features/          login, home, map, customers, visits, orders, location
  ui/                tema de la marca, widgets compartidos y formatos en español
```

## Verificación

```
flutter analyze
flutter build apk --debug
```
