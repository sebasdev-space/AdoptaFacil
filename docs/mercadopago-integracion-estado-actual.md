# MercadoPago — estado actual de la integración (2026-10-02)

> Documento de referencia operativa. Resume la arquitectura actual, lo que ya
> se validó, los problemas reales encontrados (y cómo se resolvieron o
> quedaron abiertos), y qué hace falta para seguir. Complementa a
> `docs/mercadopago-split-1-1-alcance-impacto.md` (alcance/impacto de negocio)
> — este archivo es más técnico/operativo.

---

## 1. Aplicación de MercadoPago

- **Nombre:** AdoptaFacil
- **App ID:** `1063908913630070`
- **Cuenta propietaria:** `AdoptaFacil.oficial@gmail.com` (Owner ID `3658000688`) — **distinta** de las cuentas personales de Fabián o de cualquier organización sponsor. Esto es deliberado: si una organización se conecta con la MISMA cuenta que emite el token de la app, MercadoPago lo rechaza como auto-patrocinio (`order_invalid_sponsor_id`).
- **Producto:** Checkout API + API de Orders (`POST /v1/orders`), no Checkout Pro ni la API de Payments clásica.
- **Historia:** esta es la TERCERA app usada en el proyecto. Las dos anteriores (`EasyAdopt`, `AdoptEasy`) se crearon durante la migración desde Checkout Pro y quedaron con webhooks que fallaban su verificación de firma de forma persistente e inexplicable; el 2026-10-02 el cliente las eliminó y se creó esta app desde cero con la herramienta oficial de MercadoPago (ver sección 5). Producción y credenciales de prueba de esta app ya están activadas.
- **Credenciales:** viven únicamente en `.env` (gitignored). Nunca commitear valores reales — si hace falta rotarlas, usar la herramienta MCP de MercadoPago (`get_credentials`, `save_webhook`) o el panel `https://www.mercadopago.com.co/developers/panel/app/1063908913630070`.

## 2. Herramienta MCP de MercadoPago

Este proyecto tiene conectado el servidor MCP oficial de MercadoPago
(`mercadopago-mcp-server`, `https://mcp.mercadopago.com/mcp`, requiere OAuth
una vez por sesión vía `/mcp`). Da acceso directo a:

- `application_list` / `get_credentials` — listar apps y ver sus credenciales.
- `create_application` — crear una app nueva guiado (producto, API, país se infiere del OAuth, nunca preguntar el país).
- `create_test_user` / `add_money_test_user` — usuarios de prueba (seller/buyer/integrator). **Importante:** solo existe UN usuario de prueba por perfil por cuenta de desarrollador — pedir otro "seller" devuelve siempre el mismo (`3663118866`), no crea uno nuevo.
- `save_webhook` — configurar URL + topics de webhook (sandbox y producción comparten el mismo secret).
- `notifications_history` — diagnóstico de entregas de webhook. **No confiar ciegamente**: puede decir "sin notificaciones" aunque sí hayan llegado entregas reales (confirmado contra el inspector de ngrok).
- `search_documentation` — busca en la documentación oficial actualizada. Preferir esto sobre WebSearch para cualquier duda de comportamiento de la API: la documentación pública a veces está desactualizada respecto al producto real, pero este tool trae la versión que MercadoPago considera vigente.

## 3. Usuarios de prueba relevantes (cuenta de desarrollador compartida)

| Rol                        | User ID      | Uso                                                                                                                                                                           |
| -------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Seller (automático)        | `3663118866` | Dueño de las credenciales de prueba (`APP_USR-...`) de la app — **no usar como sponsor de ninguna organización** (colisiona con el access token de la app = auto-patrocinio). |
| Buyer                      | `3662781392` | Para probar como comprador/donante en sandbox.                                                                                                                                |
| Integrator ("MARKETPLACE") | `3731402562` | Única cuenta de prueba válida como **sponsor** de una organización en sandbox, sin chocar con el seller automático.                                                           |

En producción, la organización se conecta con una cuenta REAL de MercadoPago (vía OAuth), nunca con estas.

## 4. Webhooks

- **Endpoint:** `POST /donations/webhook` (público, sin JWT) — `apps/api/src/modules/donations/donations.controller.ts`.
- **Topics suscritos:** `payment` y `order` (ambos necesarios: la Orders API puede emitir cualquiera de los dos).
- **URL registrada:** la del túnel de ngrok activo + `/api/donations/webhook`, tanto en "Modo de prueba" como en producción (mismo secret en ambos modos). **Hay que re-registrarla cada vez que cambia la URL de ngrok** (`save_webhook` del MCP).
- **Firma:** header `x-signature: ts=...,v1=...`. Manifest: `id:<data.id en minúsculas>;request-id:<x-request-id>;ts:<ts>;`, HMAC-SHA256 con el secret del webhook. Implementación: `MercadoPagoPaymentAdapter.verifyAndNormalizeWebhook` (`apps/api/src/core/payments/mercadopago-payment.adapter.ts`). Verificado carácter por carácter contra la documentación oficial y contra el SDK oficial de MercadoPago — la fórmula es correcta.
- **Logging de diagnóstico:** hay un `logger.debug` justo antes de la comparación de firma que imprime el manifest, la firma calculada y la recibida (secret solo muestra los últimos 6 caracteres). Déjalo — fue clave para resolver el bug de abajo y para cualquier investigación futura.

### Bug resuelto: el log de rechazo mentía sobre la causa

`DonationsService.applyWebhook` (`apps/api/src/modules/donations/donations.service.ts`)
envolvía TODO error de `verifyAndNormalizeWebhook` bajo el mensaje genérico
_"Webhook rechazado (firma inválida)"_, sin importar la causa real. Esto
desvió días de investigación: un webhook puede fallar por firma inválida,
pero también porque el `GET /v1/orders/:id` posterior (para traer el estado
real) falla, porque falta `external_reference`, o porque faltan
headers/query params. **Ahora el log muestra el mensaje real del error** —
si vuelve a aparecer un 403 de webhook, mirar el log ANTES de asumir que es
un problema de firma.

### Pendiente / no resuelto

Con una app completamente nueva y limpia, en **sandbox**, dos órdenes reales
procesadas exitosamente (`status: processed`, `accredited`) **nunca
generaron ningún webhook** — ni uno fallido, nada llegó. Hipótesis sin
confirmar: MercadoPago podría no notificar cuando la orden ya se resuelve en
la misma respuesta síncrona de creación (no hay "cambio de estado"
posterior que notificar). En **producción**, en cambio, el webhook SÍ llegó
y validó correctamente dos veces para una orden real. No hay que asumir que
sandbox y producción se comportan igual en este punto — probar siempre en
producción antes de concluir que el webhook "no funciona".

## 5. Split de Pagos 1:1 — hallazgo crítico: Colombia no está soportado

La documentación oficial de Split de Pagos 1:1 (`/developers/es/docs/split-payments/split-1-1/overview`) lista la disponibilidad por país:

```
available_countries: mla, mlb, mlm, mlc, mpe
```

(Argentina, Brasil, México, Chile, Perú) — **Colombia (MCO) no aparece.**
AdoptaFácil opera en Colombia.

Esto se confirmó con una prueba real (dinero real, producción):
`integration_data.sponsor.id` se incluyó correctamente en la orden (visible
en `GET /v1/orders/:id`), la orden se procesó y acreditó, pero **el 100% del
dinero quedó en la cuenta de la app — nada se transfirió a la cuenta
sponsor**. El campo se acepta sin error de validación, lo cual hace parecer
que el split va a funcionar, pero el mecanismo real de reparto
aparentemente no se ejecuta para cuentas colombianas.

La documentación también exige una **cuenta de vendedor con KYC nivel 6**
para split — no hay forma confirmada de verificar si una cuenta la cumple.

**Estado:** se envió una consulta formal a MercadoPago (soporte/ejecutivo
comercial) preguntando explícitamente: (1) si Split 1:1 vía Orders API está
soportado para Colombia, (2) por qué el campo se acepta sin error si no lo
está, (3) cómo verificar el nivel KYC de una cuenta, (4) qué alternativa
recomiendan para un modelo de comisión de marketplace en Colombia (p.ej.
dispersión manual vía Payouts/Disbursements). **Respuesta pendiente** — no
asumir que el split funciona en producción real hasta tener confirmación.

**Implicación práctica:** el código sigue enviando `sponsor.id` (no se
revirtió — la decisión de seguir así fue explícita del cliente mientras se
espera respuesta), pero **no hay garantía de que la plata realmente se
reparta** fuera de pruebas controladas. No comunicar al cliente/organizaciones
que el split está "funcionando" hasta tener la confirmación de MercadoPago.

## 6. Comisión de la plataforma (4%) — sigue sin mecanismo

No existe ningún campo equivalente a `application_fee`/`marketplace_fee` que
funcione en la API de Orders (verificado empíricamente: ambos se aceptan
pero se ignoran). Esto es un `TODO(client)` desde antes de esta sesión y
sigue abierto — ligado también a la duda de la sección 5 (si Split 1:1 ni
siquiera reparte fondos en Colombia, la comisión automática tampoco puede
resolverse sin la respuesta de MercadoPago).

## 7. Sesión / cookie de refresh — bug resuelto (no es específico de MercadoPago, pero lo expuso)

La cookie `af_refresh` (`apps/api/src/core/auth/refresh-cookie.util.ts`)
tenía `path: '/auth'`. El proxy temporal de Vite para el túnel de ngrok
(`apps/web/vite.config.ts`, marcado `TEMPORARY`) hace que el navegador vea
TODAS las llamadas como `/api/...`, incluyendo `/api/auth/refresh/silent` —
que nunca calzaba con el scope `/auth` de la cookie. Resultado: cualquier
recarga completa de página perdía la sesión silenciosamente. El flujo de
OAuth Connect de MercadoPago es, en la práctica, una de las pocas
interacciones del producto que fuerza una recarga completa real — por eso
el bug se manifestó ahí primero, aunque no es exclusivo de ese flujo.
**Arreglado** ampliando el `path` a `/` (funciona con o sin el prefijo
`/api`). Cuando se retire el proxy temporal de ngrok, revisar si conviene
volver a angostar el scope.

## 8. UX: "Conectar Mercado Pago" tiene su propia pestaña

Antes vivía como una tarjeta fija debajo del formulario de perfil de la
organización, visible sin importar qué pestaña interna estuviera activa
("Datos institucionales", "Ubicación", etc.). Ahora es su propia pestaña
**"Medios de pago"** (entre "Imágenes y redes" y "Acerca de nosotros"), y se
abre automáticamente al volver del round trip de OAuth. Ver
`apps/web/src/features/org/components/org-profile-form.tsx`.

## 9. Próximos pasos

1. Esperar respuesta de MercadoPago sobre disponibilidad de Split 1:1 en Colombia (sección 5) — es el bloqueante real del modelo de negocio.
2. Según esa respuesta, decidir: seguir con `sponsor.id` (si confirman que sí funciona pero necesita algo más, p.ej. KYC 6), o migrar a dispersión manual T+1 (ya contemplada como Fase 2 en el documento base) usando la API de Payouts/Disbursements.
3. Investigar por qué sandbox no genera webhooks para órdenes síncronamente resueltas (sección 4) — no bloquea producción, pero sí dificulta seguir probando sin gastar dinero real.
4. Revertir el proxy temporal de ngrok en `apps/web/vite.config.ts` cuando termine la demo, y reconsiderar el `path` de la cookie de refresh en ese momento.
