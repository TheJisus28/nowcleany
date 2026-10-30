# Preguntas abiertas

Cada punto tiene el default que se está usando mientras no haya respuesta. Las resueltas quedan al final.

## Negocio

| #   | Pregunta                                                                  | Default actual                                                                                                                                                                                                                                                                                |
| --- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| N2  | ¿Las preventas en borrador cuentan para planear?                          | No; solo las confirmadas. Los borradores se muestran aparte como demanda potencial.                                                                                                                                                                                                           |
| N4  | Presentaciones y mínimos del proveedor (p. ej. tambor de 200 L)           | Fuera; se sugiere la cantidad exacta faltante.                                                                                                                                                                                                                                                |
| N6  | ¿Producción en baches completos o en la cantidad exacta?                  | Cantidad exacta en litros; la capacidad de bache es informativa (la UI calcula los baches).                                                                                                                                                                                                   |
| N7  | "Capacidad" cuando dos presentaciones compiten por la misma materia prima | Se calcula por producto, de forma independiente (ver ADR 0002).                                                                                                                                                                                                                               |
| N9  | Datos del cliente                                                         | Mínimos: nombre y NIT opcional.                                                                                                                                                                                                                                                               |
| N10 | Vendedor de la preventa                                                   | El usuario que la registra.                                                                                                                                                                                                                                                                   |
| N11 | Producción real distinta a la planeada                                    | Al completar se indica la cantidad real; el consumo es proporcional a ella.                                                                                                                                                                                                                   |
| N12 | Recepciones parciales de una orden de compra                              | No: recibir registra las cantidades reales y cierra la orden.                                                                                                                                                                                                                                 |
| N13 | Formato del archivo plano                                                 | CSV UTF-8, separador `;` o `,`; con `;` se acepta coma decimal (Excel en español).                                                                                                                                                                                                            |
| N14 | Precios y costos                                                          | Fuera de esta fase.                                                                                                                                                                                                                                                                           |
| N15 | Rol de Gerencia                                                           | Rol `manager`: ve el reporte de sobreventa y todos los paneles, sin administrar usuarios.                                                                                                                                                                                                     |
| N16 | Qué paneles ve cada rol                                                   | Ventas: Inicio, Preventas, Clientes · Planta: Planta, Inventario, Catálogo · Compras: Compras, Inventario · Bodega: Inventario · Formulación y jefe técnico: Catálogo · Gerencia: todo menos Usuarios. Es solo presentación (`apps/web/src/app/nav.ts`); la API sigue validando cada permiso. |
| N17 | "¿Cuánto puedo prometer?" para ventas                                     | Stock + lo que se puede fabricar hoy − lo comprometido, por producto (mismo supuesto de N7). Informativo: no bloquea la sobreventa.                                                                                                                                                           |

## Técnicas

| #   | Pregunta                                                   | Default actual                                                                                                            |
| --- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| T2  | Idioma de los mensajes de log                              | Español; las claves estructuradas (requestId, actorId, module) en inglés.                                                 |
| T3  | Node 26 pasa a LTS el 2026-10-28                           | Se fija Node 24.22.1 (LTS hoy). Evaluar migración después.                                                                |
| T4  | GitHub Actions fijadas por tag (`@v5`), no por SHA         | Sin red hacia GitHub no se pueden resolver SHAs; fijarlas por SHA al subir el repo.                                       |
| T6  | Swagger UI sobre Fastify requiere `@fastify/static` (peer) | Se agrega en M1 como consecuencia del stack fijado (@nestjs/swagger + Fastify).                                           |
| T7  | `minimumReleaseAge`                                        | 1 día (el default de pnpm, explícito). Subirlo a 3–7 días si se quiere más margen.                                        |
| T8  | Tailwind en el frontend                                    | Agregado al stack por pedido del cliente.                                                                                 |
| T9  | Rate limiting con varias instancias                        | Almacenamiento en memoria por instancia (degrada bien). Compartido solo si hace falta.                                    |
| T10 | Sesiones: el access token dura 15 min (brief)              | Refresh token rotativo de 12 h (guardado como hash) para no pedir login cada 15 min; va en el cuerpo, no en cookie.       |
| T11 | Scripts de instalación de dependencias                     | Ninguno se ejecuta: argon2 usa sus binarios precompilados; scarf (telemetría), ssh2, cpu-features y protobufjs denegados. |
| T12 | Frontend y API en el mismo origen                          | En desarrollo, proxy de Vite hacia la API; en producción, un proxy inverso sirve ambos (sin CORS).                        |
| T13 | Prueba e2e con API y worker en el mismo proceso            | El worker se prueba al final: comparte el registro estático de transacciones. En producción son procesos separados.       |
| N9  | Radio para dar una visita como "en sitio"                  | 150 m desde la sucursal más la precisión del GPS (máximo 100 m extra). Ajustable con la empresa.                          |
| N10 | Sucursal sin ubicación                                     | Se permite; la visita queda sin distancia (no se puede decir si fue en sitio) hasta ubicar la sucursal en el mapa.        |
| N11 | Merma del envasado                                         | Se registra en litros del granel de la fórmula; si se envasa sin granel (solo empaque) no aplica.                         |
| N12 | ¿Quién ve todas las preventas?                             | Gerencia, planta, compras y bodega (las necesitan para producir, comprar y despachar). Clientes: gerencia y bodega.       |

## Resueltas

| #   | Pregunta                                         | Respuesta (2026-10-24)                                                          |
| --- | ------------------------------------------------ | ------------------------------------------------------------------------------- |
| T1  | Idioma de rutas, JSON, enums, permisos y roles   | Inglés; textos visibles en español.                                             |
| N1  | ¿El inventario físico puede quedar negativo?     | Sí. La sobreventa y el faltante no son problema; nunca sobreinventario.         |
| N3  | Compras en tránsito                              | Incluidas en versión mínima (orden de compra simple), sin casos rebuscados.     |
| N5  | Fecha estimada de entrega y cliente en el pedido | Sí; una sola planta de producción.                                              |
| N8  | ¿Producir descuenta materias primas por fórmula? | Sí (propuesta SCIP): producción descuenta químicos; envasado, granel y empaque. |

## Flujo con autorizaciones (2026-10-29)

| #   | Pregunta                                | Default actual                                                                                            |
| --- | --------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| F1  | ¿Despacho parcial?                      | Lo autoriza el consolidado (Diego) al facturar, pedido por pedido; si no, se despacha completo.           |
| F2  | ¿Qué factura se lleva primero el stock? | La prioridad que pone Diego; las que no tienen prioridad van por fecha prometida.                         |
| F3  | Sugerencia de compra del mes            | Lo facturado el mes anterior por producto, ajustable por compras; desde el día 22 se planea el siguiente. |
| F4  | IVA y plazos                            | IVA 19 % en ventas y compras; 30 días para cobrar a clientes y para pagar a proveedores.                  |
| F5  | ¿Quién registra cobros y pagos?         | El rol contable. Silvia (recepción) solo ingresa facturas de proveedor y la mercancía.                    |
| F6  | Datos de demo                           | Seis meses de historia que no mueven el inventario de hoy; el estado de hoy deja algo en cada bandeja.    |
