# MercadoPago — Split 1:1 por organización: alcance e impacto

> Documento de trabajo para validar el cambio de arquitectura antes de escribir código.
> No es el documento de entrega al cliente; es la base técnica para esa conversación.

## 1. Qué pidió el cliente

Cada organización conecta/autoriza su propia cuenta de MercadoPago desde AdoptaFácil
(flujo oficial de autorización OAuth, sin contraseñas ni tokens manuales). El dinero se
reparte automáticamente en el momento del cobro vía Split 1:1 de MercadoPago:

```
Donante → AdoptaFácil → MercadoPago → Split 1:1 → cuenta MP del refugio + comisión AdoptaFácil
```

UX esperada por el cliente: "Conecta tu cuenta de MercadoPago para recibir tus
donaciones" → [Conectar MercadoPago] → autenticación/autorización en MercadoPago →
vuelve a AdoptaFácil → "Cuenta conectada 🟢". Cero fricción técnica para el refugio.

## 2. Qué existe hoy (arquitectura actual, Fase 1)

Construida deliberadamente para lo contrario de lo que se pide ahora: **una sola cuenta
MercadoPago de AdoptaFácil** recauda todo, con dispersión T+1 manual después.

- **Recaudo:** `createCollection` arma una preferencia de Checkout Pro con **un único**
  `MERCADOPAGO_ACCESS_TOKEN` de plataforma (`apps/api/src/core/payments/mercadopago-payment.adapter.ts:153`).
  No hay credencial por organización en ningún lado.
- **Decisión ya documentada de NO usar split:** `packages/contracts/src/payments.ts:8-12`
  ("el port nunca modela un split") y el docblock del propio adapter
  (`mercadopago-payment.adapter.ts:90-113`): "consolidated collection + MANUAL T+1
  payout... never MercadoPago's Marketplace split".
- **Comisión del 4%:** se calcula y se le muestra al donante (`computeBreakdown()`,
  `packages/contracts/src/payments.ts:285-312`), pero es **contabilidad interna pura** —
  MercadoPago le cobra el monto completo al donante y lo deposita TODO en la cuenta de
  AdoptaFácil; el "neto" del refugio solo se materializa después, en el payout manual.
- **Tarifa del gateway:** hardcodeada (`PAYMENT_FEE_CONFIG`,
  `packages/contracts/src/payments.ts:241-255`) y todavía con la tarifa vieja de Wompi
  (2.65% + $700), marcada `TODO(client)` pendiente de la tarifa real de MercadoPago.
- **Quién paga la comisión:** ya soporta ambos modos, implementado y probado
  (`commissionPayer: 'organization' | 'donor'` — coincide exactamente con el ejemplo que
  dio el cliente de "el donante paga encima").
- **Dispersión T+1 (`createPayout`):** stub, lanza error explícitamente — bloqueado
  hasta que MercadoPago apruebe el permiso "Disbursements"
  (`mercadopago-payment.adapter.ts:284-299`). El resto del pipeline alrededor
  (`payouts.service.ts`: reintentos, BullMQ, reconciliación) sí está construido, pero
  todo llama a este método sin implementar.
- **Cuenta bancaria de destino:** `BankAccountsController` (`/org/payout-bank-account`)
  guarda datos de transferencia manual (banco, tipo de cuenta, número, titular) para el
  payout T+1 — **no** es conexión de cuenta MercadoPago, es el "¿a qué cuenta bancaria te
  giramos?".

## 3. Por qué esto es un cambio de arquitectura, no una extensión

Todo lo del punto 2 asume una sola cuenta recaudadora central. Pasar a Split 1:1 con
conexión OAuth por organización:

1. Requiere un flujo OAuth authorization-code completo (endpoints backend + UI de
   "Conectar MercadoPago" en el frontend) — **0% construido hoy**.
2. Requiere guardar `access_token`/`refresh_token`/`collector_id` por organización — no
   existe ese esquema (solo existen los datos de cuenta bancaria manual, que es un
   concepto distinto).
3. Requiere reescribir `createCollection` para pasar `collector_id`/`marketplace_fee` (o
   el mecanismo equivalente) por preferencia, en vez del token único de plataforma.
4. Probablemente **jubila por completo** el pipeline de payout manual actual
   (`createPayout`, `BankAccountsController`, reconciliación, BullMQ retries): si
   MercadoPago le paga al refugio directo en el momento del split, ya no hace falta que
   AdoptaFácil dispers e nada — ese trabajo ya construido y probado deja de tener uso.

No es "avanzar sobre lo que hay": es reemplazar la mitad del módulo de pagos por un
modelo distinto.

## 4. Preguntas técnicas abiertas (a validar antes de diseñar)

El propio cliente pidió explícitamente confirmar esto antes de implementar — no hay
respuesta todavía, hay que investigarlo contra la documentación oficial vigente de
MercadoPago antes de comprometer un diseño:

- ¿El split de comisión (`marketplace_fee`) se soporta directamente sobre **Checkout
  Pro** con una cuenta conectada por OAuth, o MercadoPago exige migrar a la **API de
  Orders** más nueva para ese caso? (el cliente menciona ambas opciones sin decidir).
- ¿Es compatible con el mecanismo ya implementado de "el donante cubre la comisión"
  (`commissionPayer: 'donor'`), o el split de MercadoPago tiene sus propias reglas de
  quién absorbe qué costo que chocan con eso?
- ¿Qué pasa con el token OAuth de una organización si expira, se revoca, o el refugio
  desconecta la cuenta — cómo se refleja eso en el flujo de donación (bloquear
  donaciones a esa org, avisar al donante, etc.)?
- ¿Las donaciones en curso al momento de migrar (si las hay) quedan en el modelo viejo o
  hay que soportar ambos modelos en paralelo por un tiempo?
- Vigencia de la tarifa: el cliente pidió que sea configurable y no quemada — eso aplica
  igual en el modelo con split (¿la tarifa de plataforma se sigue definiendo del lado de
  AdoptaFácil vía `marketplace_fee`, o pasa a depender de configuración por organización
  en MercadoPago?).

## 5. Tamaño relativo del trabajo neto nuevo (cualitativo, no estimado en fechas)

| Pieza                                                  | Estado hoy              | Tamaño                                  |
| ------------------------------------------------------ | ----------------------- | --------------------------------------- |
| Flujo OAuth backend (authorize/callback/token refresh) | 0%                      | Alto                                    |
| UI "Conectar MercadoPago" + estado de conexión         | 0%                      | Medio                                   |
| Esquema: credenciales OAuth por organización           | 0%                      | Bajo-Medio                              |
| Reescribir `createCollection` con `collector_id`/split | Parcial (base reusable) | Medio                                   |
| Retirar/reemplazar pipeline de payout manual           | Construido, a desmontar | Medio (es borrar + limpiar referencias) |
| Tarifa configurable (independiente del split)          | Hardcodeada hoy         | Bajo                                    |

## 6. Recomendación

No arrancar el diseño técnico todavía. Este documento resume el impacto real para que
el cliente confirme, con las preguntas abiertas de la sección 4 ya resueltas, que quiere
seguir adelante con Split 1:1 sabiendo que reemplaza trabajo ya entregado — y para que
el equipo (Fabián + Sebastián) pueda dar un estimado de tiempo real una vez esas
preguntas técnicas tengan respuesta.
