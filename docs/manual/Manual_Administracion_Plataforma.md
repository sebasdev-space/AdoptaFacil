# AdoptaFácil

## Manual de Administración de Plataforma

_Uso interno — equipo AdoptaFácil._

Este manual es para el equipo interno de AdoptaFácil, con cuentas de rol **PlatformAdmin** o
**PlatformSuperAdmin**. Estas cuentas no pertenecen a ninguna organización: supervisan y moderan a
**todas** las organizaciones y personas de la plataforma. Si buscas el manual de una organización o de
una persona, consulta los otros dos documentos de esta serie.

Este documento todavía no incluye capturas de pantalla — no hay forma automatizada de navegar y capturar
la UI en esta ronda. Todo lo aquí descrito sí se validó contra la API real (con una credencial de
PlatformAdmin/PlatformSuperAdmin de prueba) y por la suite de pruebas automatizadas del proyecto
(incluida `platform-dashboards.integration-spec.ts`, en verde), además de confirmar en vivo que una
cuenta de organización recibe acceso denegado al intentar entrar a estas rutas.

## Índice

[TOC]

## 1. Tus dos roles

| Rol                    | Alcance                                                                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **PlatformAdmin**      | Revisión de documentos, organizaciones duplicadas, moderación de comunidad y de reseñas, dashboard operativo de plataforma.                      |
| **PlatformSuperAdmin** | Todo lo anterior, **más** el dashboard financiero consolidado (cifras de dinero de toda la plataforma) — un PlatformAdmin normal no puede verlo. |

Ninguna cuenta de organización ni de Persona puede entrar a ninguna de las pantallas de este manual: se
les deniega el acceso automáticamente (confirmado con una prueba real: una cuenta Owner de organización
recibe rechazo explícito al intentar usar estas rutas).

## 2. Revisión de documentos institucionales

Ruta: **Revisión de documentos** (`/plataforma/documentos`). Aquí revisas los documentos que cada
organización sube durante su proceso de formalización (RUT, certificado de existencia y representación
legal, documento del representante legal, otros). Por cada uno decides: Aprobar, Rechazar u Observar
(con motivo). Tu decisión es lo que permite a una organización avanzar de una etapa de formalización a la
siguiente.

## 3. Organizaciones duplicadas

Ruta: **Organizaciones duplicadas** (`/plataforma/organizaciones-duplicadas`). El sistema detecta
automáticamente coincidencias por NIT exacto o nombre muy similar entre organizaciones al momento del
registro o la edición de perfil, y las deja en esta cola para tu revisión — es una medida de mitigación
de riesgo (captación ilegal / lavado de activos) exigida por el documento base del proyecto. Aquí
decides si es un duplicado real (y qué hacer al respecto) o un falso positivo.

## 4. Moderación de comunidad

Ruta: **Moderación de comunidad** (`/plataforma/comunidad`). Revisas publicaciones, comentarios y
reportes del feed de Comunidad (M11) y puedes retirar contenido inapropiado. Esta es la única capa de
moderación de Comunidad — ninguna organización puede moderar el contenido de otra, ni siquiera el suyo
propio más allá de borrar sus propias publicaciones.

## 5. Moderación de reseñas

Ruta: **Moderación de reseñas** (`/plataforma/resenas`). Cada reseña que una Persona deja sobre una
organización llega aquí como pendiente antes de contar en el indicador público de esa organización.
Apruebas, rechazas u observas cada una.

Desde el PR #172, el backend ya exige que el autor tenga una adopción aprobada, una donación aprobada, o
un apadrinamiento con al menos un pago real antes de dejarlo reseñar — no solo evita una segunda reseña a
la misma organización, evita la primera sin fundamento. Esta cola sigue existiendo para el resto de la
moderación (contenido inapropiado, ofensivo, etc.), no para suplir esa validación.

## 6. Dashboard de plataforma

Ruta: **Dashboard de plataforma** (`/plataforma/dashboard`), para PlatformAdmin y PlatformSuperAdmin.
Muestra los conteos consolidados de las tres colas anteriores (documentos pendientes, organizaciones
duplicadas sin resolver, reseñas pendientes), para que tu equipo priorice el trabajo del día.

## 7. Dashboard financiero (solo PlatformSuperAdmin)

Ruta: **Dashboard financiero** (`/plataforma/dashboard/financiero`). Muestra:

- Indicadores consolidados de organizaciones (total, activas, nuevas, por nivel de verificación).
- **Tasa de crecimiento mensual de organizaciones registradas (RF28)**: compara las organizaciones
  registradas en los últimos 30 días contra los 30 días anteriores a esos, con el % de cambio junto al
  conteo — cubre organizaciones; volumen de donaciones/adopciones no está incluido en este indicador.
- **Mapa de Colombia real**: distribución geográfica de organizaciones como un mapa coroplético
  (departamentos coloreados según cuántas organizaciones tienen registradas ahí), con la geometría real
  de la división política del país — ya no es una lista de barras.
- Cifras financieras agregadas: volumen recaudado, dispersado y neto.
- **Conciliación de recaudo vs. dispersión**: cruza lo recibido a través de MercadoPago Collections
  contra lo efectivamente dispersado a cada organización, señalando diferencias para revisión
  manual, por organización y por período.

Un PlatformAdmin que no sea SuperAdmin no puede ver esta pantalla ni sus cifras — se lo confirma un
aviso de acceso denegado.

**Aviso vigente (reemplazo de pasarela, sep-2026):** el recaudo ya corre 100% sobre MercadoPago,
pero la dispersión (`createPayout`) todavía NO está implementada para MercadoPago — requiere que
MercadoPago apruebe el permiso "Disbursements" sobre la aplicación del cliente, trámite en curso.
Mientras esa aprobación no llegue, el lado "dispersado" de la conciliación se queda en cero para
toda donación recaudada después del cambio de pasarela: no es un error del reporte, es el estado
real de la integración. Avísale al equipo de desarrollo en cuanto el cliente confirme la
aprobación, para retomar esa parte.

## 8. Resumen de hallazgos de la última verificación

Esta sección se actualiza cada vez que se corre una ronda de verificación completa del sistema.

**Ronda del 18/19-sep-2026:** typecheck, lint, tests unitarios (backend + frontend) y de integración en
verde (incluido el gate obligatorio de no-filtración entre organizaciones, `rls-no-leak`). Los 14 módulos
de negocio se probaron en vivo contra la API real con cuentas de organización y de persona. Se
encontraron 4 hallazgos, los 4 ya corregidos y fusionados a `main`:

| #   | Hallazgo                                                                                         | PR                                                             | Estado       |
| --- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- | ------------ |
| 1   | Reputación (M12): no se exigía interacción real antes de reseñar                                 | [#172](https://github.com/sebasdev-space/AdoptaFacil/pull/172) | ✅ Corregido |
| 2   | Portal público + Banco de recursos (M14/M09): necesidades no se veían en el portal propio        | [#175](https://github.com/sebasdev-space/AdoptaFacil/pull/175) | ✅ Corregido |
| 3   | "Registrar fallecimiento" (M07) era un aviso "Próximamente" sin backend                          | [#173](https://github.com/sebasdev-space/AdoptaFacil/pull/173) | ✅ Corregido |
| 4   | Dashboard financiero (M13): faltaba tasa de crecimiento (RF28) y el mapa era una lista de barras | [#174](https://github.com/sebasdev-space/AdoptaFacil/pull/174) | ✅ Corregido |

Ninguno de los cuatro comprometía los invariantes de seguridad del sistema (aislamiento entre
organizaciones, control de acceso por rol, auditoría, cifrado de la firma legal, ausencia de custodia de
fondos) — todos se verificaron correctos y sin excepciones durante la ronda original y se re-verificaron
después de fusionar las cuatro correcciones juntas.

**Pendiente real, no de esta ronda:** la conciliación de recaudo vs. dispersión (sección 7) y el resto
del dashboard financiero solo cubren organizaciones registradas para el indicador de crecimiento (RF28);
una serie de tiempo de donaciones/adopciones sigue fuera de alcance hasta que el documento base la pida
explícitamente.

**Cambio posterior (20-sep-2026): reemplazo de pasarela de pago.** Por decisión del cliente,
MercadoPago reemplazó completamente a Wompi ([#177](https://github.com/sebasdev-space/AdoptaFacil/pull/177)),
manteniendo el mismo modelo (recaudo consolidado + dispersión T+1 manual, nunca el split automático
de Marketplace). Verificado en vivo contra el sandbox real de MercadoPago antes de fusionar. Dos
cosas quedan pendientes de que el cliente confirme, sin las cuales esta parte no está 100% cerrada:

1. La comisión real de pasarela asignada a su cuenta (el desglose que ve el donante sigue mostrando
   temporalmente la tarifa vieja de Wompi, marcado con `TODO(client)` en el código).
2. Si su aplicación de MercadoPago ya tiene aprobados los permisos de "Disbursements" — sin eso, la
   dispersión T+1 real (Fase 2) sigue sin poder implementarse, y el recaudo actual no tiene forma
   automática de llegar a la cuenta bancaria de las organizaciones (ver sección 7, aviso vigente).

## 9. Soporte

Ante cualquier duda sobre el comportamiento de una pantalla de este manual que no coincida con lo que
ves en producción, repórtalo al equipo de desarrollo citando la ruta exacta y el rol con el que
iniciaste sesión.
