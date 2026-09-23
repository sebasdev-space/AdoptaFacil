# Prompt para Claude Code de Fabián — contexto del mockup `AdoptaFacil_Mockup_Ruta13Ago.html`

Pega esto en tu Claude Code junto con el archivo del mockup. Es la explicación de cómo lo construí y qué tener en cuenta antes de traducirlo al código real — no es una tarea de construcción todavía, es el brief técnico previo.

## Qué es el archivo adjunto

Un mockup HTML+Tailwind autocontenido, sin backend, con datos ficticios. Representa las 11 pantallas que sí van a la demo del 13 de agosto (público + panel de organización + PlatformAdmin), con un switcher abajo a la derecha para moverte entre los 3 modos. Es referencia visual y de arquitectura — no se copia el HTML/CSS tal cual, se traduce al React/Tailwind real del proyecto.

## Cómo lo construí (para que sepas qué es intencional y qué es solo un atajo de mi entorno)

- **Colores**: no los inventé — los saqué analizando los píxeles del logo real (`LogoAdoptaFacil.jpeg`). Navy `#202D3E`, teal `#25BAA6`, y derivé teal-dark `#1C9483`, teal-light `#E7F8F5`, navy-soft `#3A4B62` para estados hover/fondos suaves. Estos sí son los reales, úsalos como fuente de verdad si el proyecto no tiene ya algo distinto acordado.
- **Tipografía**: usé system font stack (`-apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`) porque mi sandbox no tiene salida a internet y no pude cargar Google Fonts. Esto NO es una decisión de marca — si el proyecto real ya tiene una tipografía definida, usa esa y descarta la mía.
- **Tailwind**: lo compilé localmente vía CLI (`npx tailwindcss`) e inyecté el CSS resultante inline en el HTML, en vez de usar el CDN de Tailwind — otra vez, por falta de red en mi sandbox, no por ser la forma correcta de hacerlo en el proyecto real. Tú ya tienes tu propio pipeline de Tailwind funcionando, usa ese normal.
- **Iconos**: SVG inline dibujados a mano, estilo outline simple (parecido a heroicons pero no es la librería), sin dependencia externa.
- **Fotos de animales/logos de org**: son placeholders (rectángulos con patrón diagonal verde claro) — no hay imágenes reales en el mockup. En el código real van las imágenes reales que ya trae el backend.
- **Estructura del archivo**: un solo HTML con 3 "modos" (Público / Organización / Plataforma) que se muestran/ocultan con JS simple (`showMode`, `showPublic`, `showOrg`). Eso es solo para poder navegar todo sin backend en un único archivo — en React esto son rutas reales, no un switcher de JS.

## Componentes/patrones de diseño que usé (candidatos a formalizar en `packages/ui`)

- Botones: `primary` (teal sólido), `outline` (borde gris, se pone teal en hover), `dark` (navy sólido).
- Card: `rounded-2xl`, borde sutil `#EEF1F4`, sombra suave.
- Badge de estado, 4 variantes: verde (activo/vigente), ámbar (pendiente/por vencer), rojo (rechazado/fallido), gris (neutro/suspendido).
- Pill: para filtros y tabs secundarios (catálogo, tabs del switcher).
- Sidebar oscura fija (vista Organización): navy, ítem activo resaltado en teal.
- Tablas de listado hechas con grid de CSS, no `<table>` — encabezado en mayúsculas pequeñas gris.

## Arquitectura de navegación — los 3 "modos" que armé

1. **Público**: nav superior fija + fila de pills de navegación secundaria debajo.
2. **Organización**: sidebar oscura fija a la izquierda + contenido a la derecha.
3. **Plataforma**: header simple, deliberadamente distinto al de Organización — para que en la demo en vivo se note claramente el cambio de rol cuando se loguea como PlatformAdmin para aprobar documentos.

## Qué tener en cuenta al traducir esto al código real — esto es lo que importa

- No copies el HTML/CSS del mockup literal — tradúcelo, no lo pegues.
- Antes de crear un componente nuevo en `packages/ui`, revisa si ya existe algo parecido (por ejemplo la sidebar de organización probablemente ya tiene una versión — no la dupliques, reconcíliala).
- Todo dato del mockup (nombres, montos, fechas, "Huellas de Esperanza", "Refugio Patitas") es ilustrativo. En el código real todo tiene que salir de datos reales del backend — nada hardcodeado.
- No toques RBAC/roles/gates al aplicar esto: es puramente visual.
- El mockup solo lo probé en desktop (1440px) — mobile/tablet no está resuelto ahí, hay que trabajarlo aparte en el código real.
- Revisa contraste AA en cualquier token de color nuevo — no reintroducir el problema que ya se arregló en F1-03.
- Esto toca `packages/ui` (compartido) y pantallas que ya construí yo (Sebastián) en S2-03, S2-05, S2-06 y S2-07 — coordina conmigo antes de mergear.
- Referencia complementaria: `RutaPresentacion_13Ago_20260809.md`, que ya define qué pantallas entran a la demo del 13 y cuáles quedan fuera (para no gastar tiempo en algo que no se muestra ese día).
