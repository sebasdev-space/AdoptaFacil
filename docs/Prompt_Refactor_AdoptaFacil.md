# Prompt para Claude Code — Refactorización **visual total** de AdoptaFácil

> Pega este bloque en Claude Code. **Antes de escribir código, abre la carpeta `ejemplos_refactorizacion/`** del repositorio: contiene el mockup `AdoptaFacil_Mockup_Ruta13Ago_1.html`, el logo `LogoAdoptaFacil` y **todas las vistas de ejemplo**. Es la **fuente de verdad visual**.

---

Actúa como **Frontend Senior + Diseñador de Sistemas de Diseño**, experto en **React, TypeScript, Tailwind CSS y SASS/SCSS con BEM**. Vas a hacer una **refactorización visual TOTAL** de la plataforma **AdoptaFácil** (rescate animal, Colombia). El aplicativo ya existe: rediseñas **solo la capa de presentación**.

## 🚨 ESTO NO ES UN "RECOLOR" — LÉELO PRIMERO

Un intento previo **solo cambió colores** y falló. Eso **no** es aceptable. Debes reconstruir el **sistema visual completo**. Cambian, como mínimo y de forma coordinada:

- **Tipografía** (familias, escala, pesos, tracking, números tabulares).
- **Tarjetas** con **bordes suaves** (hairline) y **sombras tenues** en capas.
- **Redondeos** (sistema de radios coherente, esquinas más suaves).
- **Espaciado y ritmo** (escala base 8px, más aire).
- **Botones, inputs, pills/badges, tablas, sidebar, tabs, modales/drawers, steppers, timelines** — todos re-estilizados.
- **Estados** hover/focus/active/disabled y **micro-transiciones**.
- **Iconografía** consistente y el **logo** integrado (`LogoAdoptaFacil`).

**Definition of Done (para no caer en el recolor):** cada primitivo de UI debe verse claramente distinto en forma, elevación, tipografía y espaciado, no solo en tono. Si un componente refactorizado se distingue del original _únicamente_ por el color, **está mal hecho** y debe rehacerse.

## ⛔ RESTRICCIONES CRÍTICAS (NO NEGOCIABLES)

1. **NO tocar backend/lógica**: servicios, controladores, modelos, contratos de API, hooks de data-fetching, stores ni lógica de negocio. Solo presentación (TSX de UI, SCSS, tokens, estructura de componentes).
2. **NO tocar auth ni protección de rutas** (ya existen → **solo preservarlas**). No cambies guards, middlewares, roles, redirecciones ni crees rutas nuevas: reutiliza las existentes.
3. **No romper contratos**: los componentes conservan las **mismas props y eventos**. Cambia el _look_, no la interfaz de datos. Datos faltantes → mocks locales `// TODO: conectar`, nunca cables al backend.
4. Trabaja **módulo por módulo, incremental**, sin dejar la app rota entre pasos. Consulta la vista de ejemplo antes de tocar cada módulo.
5. Ante cualquier ambigüedad **pregunta; no asumas**.

---

## 🎨 SISTEMA VISUAL INTEGRAL (fuente única de verdad)

Define `styles/tokens.scss` con `:root { … }` y refléjalo en `tailwind.config` (**una sola fuente de verdad**: colores/medidas nunca hardcodeados en componentes).

### Tipografía (yo defino la dirección — cárgalas por `@fontsource` o `next/font`)

- **Display / títulos (serif):** **Fraunces** — cálida, con carácter y confianza; para hero y encabezados grandes del Portal Público.
- **UI / cuerpo (sans):** **Plus Jakarta Sans** — geométrica-humanista, legible en dashboards densos; toda la interfaz y textos.
- **Monoespaciada:** **IBM Plex Mono** — para códigos, asientos (`#A-04252`), hashes, códigos de certificado y verificación QR.
- **Montos y cifras:** sans con `font-variant-numeric: tabular-nums` (alineación en tablas). No uses mono para dinero.
- **Micro-labels** (`uppercase`): `--text-xs`, `letter-spacing: .06em`, color `--text-muted`.

```scss
:root {
  --font-display: 'Fraunces', Georgia, serif;
  --font-sans: 'Plus Jakarta Sans', -apple-system, 'Segoe UI', Roboto, sans-serif;
  --font-mono: 'IBM Plex Mono', ui-monospace, monospace;
  /* Escala tipográfica (ratio ~1.25) */
  --fs-display-xl: 3rem;
  --lh-display-xl: 3.25rem; /* hero público */
  --fs-display: 2.25rem;
  --fs-h1: 1.875rem;
  --fs-h2: 1.5rem;
  --fs-h3: 1.25rem;
  --fs-body-lg: 1.125rem;
  --fs-body: 1rem;
  --fs-sm: 0.875rem;
  --fs-xs: 0.75rem;
  /* Pesos */
  --fw-regular: 400;
  --fw-medium: 500;
  --fw-semibold: 600;
  --fw-bold: 700;
  --fw-extra: 800;
}
```

### Color (extraído del mockup)

```scss
:root {
  --bg-primary: #f7fafa;
  --bg-surface: #ffffff;
  --brand: #25baa6;
  --brand-dark: #1c9483;
  --brand-light: #e7f8f5;
  --navy: #202d3e;
  --navy-soft: #3a4b62;
  --text-dark: #202d3e;
  --text-muted: #9ca3af;
  --text-light: #ffffff;
  --accent-gold: #f2b94d;
  --accent-coral: #ff8a65;
  --success: #1c9483;
  --warning: #f2b94d;
  --danger: #b42318;
  --neutral: #9ca3af;
  --border: #edf1f1; /* hairline suave */
  --border-strong: #e2e8f0;
}
```

### Elevación — **sombras tenues en capas** (nada de sombras duras)

```scss
:root {
  --shadow-xs: 0 1px 2px rgba(16, 24, 40, 0.05);
  --shadow-sm: 0 1px 3px rgba(16, 24, 40, 0.08), 0 1px 2px rgba(16, 24, 40, 0.04);
  --shadow-md: 0 4px 12px rgba(16, 24, 40, 0.06), 0 2px 4px rgba(16, 24, 40, 0.04);
  --shadow-lg: 0 16px 32px rgba(16, 24, 40, 0.12);
}
```

Tarjetas → `--shadow-xs`/`sm`. Popovers/drawers → `--shadow-md`. Modales → `--shadow-lg`.

### Radios — **redondeos suaves y coherentes**

```scss
:root {
  --r-sm: 0.375rem;
  --r-md: 0.625rem;
  --r-lg: 0.875rem;
  --r-xl: 1rem;
  --r-2xl: 1.25rem;
  --r-full: 9999px;
}
```

Tarjetas → `--r-xl`/`2xl`. Botones/inputs → `--r-md`/`lg`. Pills/avatars → `--r-full`.

### Espaciado (base 8px) y bordes

Escala 4/8/12/16/20/24/32/40/48. Bordes **hairline** `1px solid var(--border)` (bajo contraste). Prioriza **borde suave + sombra tenue** sobre líneas duras.

### Movimiento (micro-interacciones)

`transition: .18s cubic-bezier(.4,0,.2,1)`. Hover en tarjetas/botones: `translateY(-1px)` + subir un nivel de sombra. Focus visible: `box-shadow: 0 0 0 3px var(--brand-light)`. Sin animaciones exageradas.

### Iconografía y logo

- Set de íconos **consistente** (lucide/heroicons _outline_), stroke 1.5–2px, tamaño 16–20 en UI, 24 en headers. No mezcles estilos de íconos.
- **Logo:** usa el asset **`LogoAdoptaFacil`** de `ejemplos_refactorizacion/`. Crea `<Logo/>` (SVG/img optimizado) con variantes `light`/`dark` según fondo (sidebar `--navy` y header público oscuro usan la versión clara). No lo reemplaces por texto.

---

## REGLAS DE ARQUITECTURA

1. **Componetización real**: componentes pequeños e independientes, cada uno en su archivo. Separa presentación (`.tsx`), estilos (`.module.scss` BEM), tipos (`.types.ts`) y mocks (`.data.ts`). Sin llamadas a servicios en presentación.
2. **BEM en SCSS + Tailwind SOLO utilidades**: la apariencia va en clases semánticas BEM (`bloque__elemento--modificador`, p.ej. `stat-card__value--warning`, `sidebar__link--active`, `status-pill--success`). Tailwind queda para layout/espaciado puntual (`flex`, `grid`, `gap-*`, `hidden md:block`, `overflow-x-auto`). Prohibido construir la apariencia apilando utilidades Tailwind.
3. **Mobile-first**: 1 columna → multi-columna. Sidebar fijo ~260px en desktop, drawer en móvil. Tablas densas con scroll horizontal en móvil.
4. **Estados por vista** componetizados: `loading` (skeleton), `empty` (vacío + CTA), `error` (con reintento), además del estado con datos. Primitivos `<SkeletonBlock/>`, `<EmptyState/>`, `<ErrorState/>`.

### Estructura de carpetas (solo capa visual; respeta el enrutado existente)

```
/styles         tokens.scss · base.scss
/components
  /ui           Button, StatCard, StatusPill, DataTable, Modal, Drawer, Tabs,
                ProgressStepper, Timeline, EmptyState, ErrorState, SkeletonBlock,
                ComingSoon, Logo   (+ Componente.module.scss BEM c/u)
  /layout       OrgSidebar, OrgTopbar, PublicNavbar, PublicFooter
  /modules      dashboard · adoptions · donations · sponsorships · documents ·
                formalization · public-profile · registration ·
                volunteering · public-ledger · tax-report   (estos 3 = placeholder)
```

---

## MÓDULOS EXISTENTES — REFACTORIZAR (contenido real como _seed_ en `*.data.ts`; montos `$1.240.000`)

**Layout compartido** · _OrgSidebar_ (fondo `--navy`, activo `--brand`): logo AdoptaFácil, org "Huellas de Vida" + `VERIFICADA · RTE`; ítems Resumen, Animales (45), Adopciones (6), Donaciones, Campañas (2), Apadrinamientos, Voluntariado, Banco de recursos, Marketplace, Transparencia, Formalización, Documentos (2), Equipo, Configuración, IA Asistente ("PRONTO"); footer "L. Gómez · Propietaria". _OrgTopbar_: breadcrumb, buscador `⌘K`, notificaciones, avatar "LG", badge contexto (`ESAL · formalización 80% · rendición al día`). _PublicNavbar/Footer_: enlaces Inicio, Quiénes somos, Mascotas, Campañas, Voluntariado, Transparencia + footer con redes y suscripción.

1. **Dashboard/Resumen** _(existe pero VACÍO → construir el visual)_ — "Buenos días, Laura · sábado 12 jul 2026". "Requiere tu acción" (4): Evidencia insumos $640.000 (3 días), Acta por renovar (12 días), 2 solicitudes sin revisar, Hito 2 de Luna. StatCards: Animales 45, Solicitudes 6, Recaudo neto jul $2.314.100 (▲18%), Seguimientos 96%. "Recaudo de julio — desglose" (Bruto $2.480.000, −Comisión 4% $99.200, −Pasarela $66.700, **Neto $2.314.100** + minigráfico). Formalización (stepper, Nivel 4 de 5). Documentos institucionales + Actividad reciente (timeline).
2. **Registro/Onboarding** — 5 pasos: tipo de cuenta (Persona/Organización) → datos mínimos (Nombre, Apellido, Correo, Celular, Contraseña, Depto Cundinamarca, Ciudad Bogotá, Fecha nac.) → intereses multi (Adoptar, Donar, Apadrinar, Voluntariado, Marketplace, Campañas, Servicio social). Auto-guardado "✓ guardado".
3. **Perfil Público de Organización** — Header `--navy`: "Fundación Huellas de Vida" + `Verificada · RTE`, "Bogotá · fundada 2019"; botones Donar/Adoptar/Apadrinar/Voluntariado + WhatsApp. Métricas 45·128·$41,2M·7·100%·4.8★·7. Mascotas (Luna, Rocky, Toby [Reservado], Kira), Campaña activa ($5.240.000/$8.000.000), "Necesita hoy" (Crítica), Comunidad, Calificación 4.8★(32), Libro público.
4. **Adopciones — Kanban** — Tabs Solicitudes/Seguimientos(12)/Completadas(128)/Agenda. Columnas Nuevas(2)/En evaluación(2)/Contrato con las tarjetas (Juan Pérez→Rocky SLA hoy, Sofía Herrera→Rocky, Ana Gómez→Kira, Pedro Ríos→Max, Carlos Ruiz→Toby). **Drawer** Ana→Kira: OTP, respuestas clave (Apto propio, 1 niño 7a, Sin otras mascotas, 4-6h ⚠), IA "Compatibilidad 87%", timeline, acciones.
5. **Donaciones/Certificados** — StatCards 86/4/$41,2M/12. Tabla (Mariana García Emitido, Empresa Pet+ SAS Emitido, Andrés Molina No emitido→Emitir). **Preview PDF** con QR y firmas. **Portal Donante** (Total $1.240.000, Deducible $260.400, descargas + .zip).
6. **Apadrinamientos** — StatCards 31/$1.240.000/9 de 12/84%/2. Tabla padrinos (Camila→Nala Activo, Andrés→Simba Pago fallido, Empresa Pet+→3 Activo, Rosa→Max Suspendido) + drawer. **Modal "Registrar fallecimiento"** (tono humano, opciones por padrino) + panel de pagos recurrentes.
7. **Documentos Institucionales** — Badge "ESAL 80%". StatCards Vigentes 6/Por vencer 1/Vencidos 1/Exportables. Tabla RUT, Cédula, Acta (Renovar), EE.FF. (Rechazado·subsanar) + auditoría. Error "Archivo >10 MB".
8. **Formalización** — Stepper 5 hitos (…ESAL✓→ESAL+RTE 80%). Requisitos (Acta✓, RUT✓, EE.FF. subsanación⚠, Acta asamblea pendiente), historial, beneficio, indicadores públicos.

## MÓDULOS NO EXISTENTES → **PLACEHOLDER "PRÓXIMAMENTE"**

Crea `<ComingSoon/>` reutilizable (branding nuevo, ícono, título, subtítulo). **No** maquetes su UI ni conectes datos; el ítem sigue en el sidebar con badge "Pronto" enrutando al placeholder (respeta la lógica de rutas actual).

- **Voluntariado** · **Libro público / Transparencia nacional** · **Reporte exógeno 2575**

---

## FLUJO Y CRITERIOS DE ACEPTACIÓN

1. Lee `ejemplos_refactorizacion/` (mockup + vistas + `LogoAdoptaFacil`). 2. Crea `tokens.scss`, `base.scss`, extensión `tailwind.config` y `<Logo/>`. 3. Construye primitivos `/ui` con su BEM. 4. Refactoriza módulo por módulo (empieza por Dashboard), verificando que props/eventos y rutas siguen intactos. 5. Añade los 3 placeholders. 6. Revisa responsive + 4 estados.

**Se acepta solo si:** (a) cero cambios en backend/auth/rutas; (b) el cambio es **integral** —tipografía, tarjetas con borde suave y sombra tenue, radios, espaciado, íconos y logo—, **no** un recolor; (c) apariencia gobernada por BEM/SCSS + tokens, Tailwind solo utilidades; (d) componentes reutilizables, tipados, con mocks aislados; (e) mobile-first con loading/empty/error; (f) los 3 módulos inexistentes muestran `ComingSoon`. Si algo no está claro en las imágenes, **pregunta antes de improvisar**.
