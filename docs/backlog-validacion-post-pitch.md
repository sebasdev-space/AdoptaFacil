# Backlog de validación de formularios — diferido post-pitch

> Origen: auditoría de validación de campos (required/number/text/email) en los 5 módulos
> propios (Organizaciones, Animales, Campañas, Apadrinamientos, Formalización/Documentos),
> hecha como parte de la tarea "Validación de formularios + sesión persistente". Alcance
> acotado explícitamente por decisión del equipo (tiempo limitado antes del pitch) a solo
> 2 puntos:
>
> 1. Bug de datos inválidos sin bloquear en `EvidenceEditRow` (campañas) — **corregido**.
> 2. Límites de longitud de `org-profile-form.tsx` alineados con el backend — **corregido**.
>
> Todo lo demás de la auditoría queda documentado aquí para retomar cuando haya tiempo.
> Nada de esta lista se implementó en ese PR — es un registro de hallazgos, no trabajo en curso.

## Cómo priorizar esta lista

Ninguno de estos ítems es un bug de corrupción de datos confirmado (el backend, vía Zod,
rechaza la mayoría de las entradas inválidas con 400 en vez de guardarlas — ver la nota de
verificación empírica más abajo). Son, en su mayoría, problemas de **UX**: mensajes
genéricos en vez de específicos, validación que solo ocurre al guardar en vez de en vivo, o
límites de longitud no reflejados en el frontend. El riesgo real es que un usuario real
escriba algo, no reciba ninguna señal clara, y se tope con un error confuso (o pierda lo que
escribió) al guardar — el mismo patrón que ya se corrigió para el slug duplicado y el bug de
NaN en evidencias.

## Nota de verificación empírica (no asumir "se corrompen datos" sin probarlo)

Al investigar el bug de `EvidenceEditRow` (P1 de la tarea anterior), se confirmó
empíricamente contra el backend real que un monto inválido (`12.5`, o `NaN`→`null` tras
`JSON.stringify`) **no se guarda en la base de datos** — el schema Zod
(`campaign-evidences.schemas.ts`: `z.number().int().positive().optional()`) lo rechaza con
`400 Bad Request` y el valor anterior permanece intacto. El problema real era que el
frontend no bloqueaba el intento ANTES de enviarlo, mostrando en su lugar el mensaje crudo
del backend (`"amount: Expected integer, received float"`). **Antes de "arreglar" cualquier
ítem de esta lista asumiendo corrupción de datos, verificar primero contra el backend real**
qué pasa hoy — puede que el dato esté protegido y el problema sea solo de mensaje/UX (como
en este caso), lo cual cambia el fix correcto.

---

## Animales

**`animal-form-modal.tsx`**

- L219-223: "Nombre" requerido se valida con un `if` que solo muestra un **toast**, nunca un
  error inline en el campo (sin `aria-invalid`, sin borde rojo). Sin validación en vivo.
- Sin límite de longitud en nombre/descripción/raza personalizada — el `TextAreaField` de
  animales ni siquiera acepta la prop `maxLength` (a diferencia de `OrgTextAreaField`, que sí).

**`use-animal-clinical-record.ts`**

- L118-126: "Fecha del evento" requerida es toast-only, sin error inline en ninguno de los
  dos componentes que la consumen (`animal-clinical-panel.tsx`, `animal-registro-clinico-section.tsx`).
- "Adjunto (nombre de archivo)" es texto libre sin límite ni formato.

**`animal-sponsorship-plan-modal.tsx`** (formulario real de monto de apadrinamiento — vive
bajo `features/animals`, no `features/sponsorships`)

- L93-102 y L205-212: el monto solo se valida (`Number.isFinite`, `>0`) al hacer submit — sin
  validación en vivo ni error inline en el `Input type="number"`.
- "Nombre del plan": sin requerido, sin límite de longitud.

## Campañas (lo que NO se tocó en el fix del bug de NaN)

**`campaigns-page.tsx`** (creación)

- L89-98: título/fecha límite/meta se validan juntos en un solo `if` con un **toast genérico**
  ("Datos incompletos") que no dice cuál campo falló — ningún campo tiene `error`/
  `aria-invalid` (`TextAreaField`/`SelectField` de campañas ni siquiera aceptan esa prop hoy).
- El monto de la meta no se filtra en vivo (contraste: donaciones sí lo hace — buen patrón a
  copiar, ver `donate-form.tsx:48`).
- "Título"/"Descripción": sin límite de longitud.

**`campaign-detail-page.tsx`** (edición general — el bug específico de `EvidenceEditRow.save()`
ya se corrigió; esto es todo lo demás del mismo archivo)

- L154-164 (`submitCampaign`, edición): mismo patrón de toast genérico combinado que en creación.
- L200-223 (`submitEvidence`, creación de evidencia): concepto/fecha/archivo comparten un
  toast genérico combinado; el monto sí se valida aparte (y ahora comparte lógica con la
  edición vía `parseOptionalEvidenceAmount`).

## Apadrinamientos

No hay formularios propios de texto/número en `sponsorships-page.tsx`/`sponsor-page.tsx`
(solo acciones sobre planes ya creados). El único campo real de monto es el de
`animal-sponsorship-plan-modal.tsx`, ya listado arriba en Animales.

## Formalización / Documentos

**`org-formalization-page.tsx`**

- L110-118: "Motivo" (obligatorio al retroceder de paso) usa un toast, aunque el `TextField`
  que ya usan (`profile-fields.tsx`) **ya soporta** la prop `error` con `aria-invalid`/
  `role="alert"` — simplemente no se la pasan (L236-241). Sin límite de longitud tampoco.
  Este es el fix más barato de todo el backlog: la pieza ya existe, solo falta conectarla.

**`org-documents-page.tsx`**

- L167-181: "Archivo requerido" es toast-only.
- L366-372 ("Vence, opcional"): no valida que la fecha sea futura — se puede subir un
  documento con fecha de vencimiento ya pasada, sin aviso; solo se nota después como badge
  "Vencido".

## Validación en vivo de email (transversal)

- `org-profile-form.tsx` L561-565 ("Correo de contacto") y L383-387 (Instagram/Facebook/
  TikTok/sitio web/mapa): los validadores (`validateOptionalEmail`/`validateOptionalUrl`) ya
  existen y son correctos, pero solo corren en `validate()` al hacer submit — no hay feedback
  mientras se escribe. Contraste: el campo slug sí valida en vivo (`setSlug`, con
  `validateOptionalSlug` en cada tecla) — es el patrón a replicar aquí.
- `register-organization-form.tsx` / `register-person-form.tsx`: el correo también se valida
  solo al enviar, no en vivo/al perder el foco.

## Resumen de patrón por módulo (para estimar el esfuerzo de arreglo)

| Módulo                   | ¿`validation.ts` propio?                                                           | Patrón actual                                                                                               |
| ------------------------ | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Auth (registro)          | Sí, pero solo cubre email/password/required                                        | Sin validación en vivo, sin `maxLength`                                                                     |
| Organizaciones (perfil)  | Sí, pero solo cubre email/url/slug (3 de ~15 campos)                               | Validación en vivo solo en slug; longitud ya alineada con el backend (este PR)                              |
| Animales                 | No existe                                                                          | Todo inline, toast-only, sin error inline en ningún campo                                                   |
| Campañas                 | No existe                                                                          | Inline y duplicado entre crear/editar/evidencia (el caso de `EvidenceEditRow` ya no se salta la validación) |
| Apadrinamientos          | No existe                                                                          | Inline, solo al submit                                                                                      |
| Formalización/Documentos | Reusa `TextField`/`TextAreaField` (ya soportan `error`) pero no los usan para esto | Toast-only pese a tener la pieza ya construida                                                              |

---

## Hallazgos en módulos de Fabián (Adopciones, Donaciones, Portales, Catálogo) — SOLO reporte, no tocar

No forman parte de este backlog (son de otro dominio), pero se registran aquí para que no se
pierdan entre el chat y el código, tal como se le reportaron a él aparte.

### 🔴 Urgente — Adopciones

`adoptions/pages/adoption-request-page.tsx:142-158` (fullName/email/phone): el formulario
completo es un `<div>` sin `<form>` ni `onSubmit` — el atributo `required`/`type="email"` de
los inputs (L144, L149, L152) son puramente decorativos porque nunca se dispara la
validación nativa del navegador. El envío está controlado solo por JS (`canSubmit`, L75),
que **no valida el formato del correo en absoluto** — escribir `"asdf"` habilita "Enviar
solicitud" igual, y el correo inválido viaja tal cual al backend.

### Otros hallazgos (Adopciones/Donaciones/Portales)

- `adoptions/components/adoption-followup-panel.tsx:45-48,117-129`: "Título"/"Fecha" del
  seguimiento se validan solo al hacer clic (no bloquean el botón), sin límite de longitud en
  el título, y sin validar que la fecha límite sea futura.
- `donations/components/donate-form.tsx:34,48`: el monto de donación SÍ filtra dígitos en
  vivo (buen patrón), pero no tiene tope máximo — `parseInt` puede perder precisión con una
  cadena de dígitos muy larga.
- `portals/pages/portal-theme-page.tsx:399-418`: el campo "radius" (token de diseño) no tiene
  validación de formato en vivo; un valor inválido solo se nota al guardar, con un toast
  genérico que no dice cuál campo falló.
- `catalog/**`: sin hallazgos — el único input (buscador) es un filtro cliente que nunca se
  envía al backend.
