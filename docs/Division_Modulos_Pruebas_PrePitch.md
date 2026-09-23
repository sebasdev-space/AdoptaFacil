# División de módulos — Fase de pruebas y pulido pre-pitch

> **Propósito:** en la recta final antes de la presentación, cada desarrollador puede modificar **de forma
> completa (front + back)** los módulos de su dominio **sin consultar al otro**, para avanzar rápido en la
> corrección de hallazgos de pruebas. Esto **relaja temporalmente** la regla de "contract-first / no tocar
> el dominio ajeno", que aplicará de nuevo después del pitch.
> **Excepción que se mantiene:** la **zona compartida** (abajo) sigue requiriendo un aviso corto antes de
> tocar — no aprobación formal, solo un "voy a tocar X" — porque un cambio ahí puede romper la app para
> ambos justo antes de la demo.

---

## Cómo usar este documento

- Pégalo en tu Claude Code al inicio de la sesión de pruebas.
- Indica que puedes modificar libremente (front + back) los módulos de **tu** lista.
- Antes de tocar algo de la **zona compartida**, avisa al otro por el canal de siempre (mensaje corto) y
  deja constancia; no hace falta esperar aprobación, solo que el otro sepa para no pisarse.
- Los módulos del **otro** desarrollador: no los toques en esta fase; si un hallazgo cruza a su dominio,
  repórtalo para que él lo corrija.

---

## FABIÁN (Dev #2) — puede modificar libremente (front + back)

- **Shell / layout de la aplicación** (navegación, estructura general, responsive del armazón).
- **Catálogo público** de animales (listado, filtros, detalle público — capa de presentación y su
  data-fetching).
- **Adopciones (M04):** flujo de solicitud, "Mis solicitudes", tablero/kanban de gestión, modal de detalle
  del solicitante, transiciones de estado, correos de adopción (plantilla en `modules/adoptions`).
- **Donaciones (M05):** checkout, desglose, "Mis donaciones", donaciones recibidas por la organización,
  nomenclatura fiscal.
- **Certificado de donación:** emisión, verificación, QR (`features/certificates`).
- **Portales (M14):** portal público de organización, personalización, exposición de contenido en el portal.
- **Pagos (M15):** integración de pasarela en modo de pruebas.

## SEBASTIÁN (Dev #1) — puede modificar libremente (front + back)

- **Organizaciones (M01):** perfil público, datos institucionales, registro/onboarding de organización.
- **Animales (M03):** gestión de animales, expediente y carnet clínico, eventos clínicos.
- **Campañas (M06):** listado/detalle, gestión, endpoints públicos de campañas.
- **Apadrinamientos (M07):** planes, flujo de apadrinar, gestión, escenarios (fallecimiento, pagos
  recurrentes).
- **Formalización y documentos:** niveles (Informal → ESAL+RTE), subida y revisión de documentos,
  verificación por PlatformAdmin, reporte exógeno.
- **Backend core:** infraestructura de datos, seed, configuración de entorno.

---

## 🔶 ZONA COMPARTIDA — avisar antes de tocar (no esperar aprobación, solo notificar)

Estos artefactos los usan **ambos**; un cambio sin aviso puede romper la app para los dos. Antes de
modificar, manda un mensaje corto ("voy a tocar X por Y") y procede.

- **`packages/contracts`** (los tipos/contratos compartidos): si cambias un contrato, avisa — el otro
  consume esos tipos.
- **`packages/ui`** (componentes compartidos: Button, Card, Modal, Toast, primitivos del rediseño): un
  cambio aquí afecta las pantallas de ambos.
- **Migraciones de base de datos / schema de Prisma:** dos migraciones en paralelo sin coordinar causan
  drift. Avisa antes de crear una.
- **RBAC / auth / guards / protección de rutas:** el sistema de roles es transversal; un cambio mal hecho
  bloquea o expone vistas de ambos.
- **Configuración de entorno / CI** (`env.validation`, `ci.yml`, `tailwind.config`, tokens globales):
  cambios que afectan el arranque o el build de todos.

---

## Reglas que se mantienen aunque haya prisa

1. **Cada cambio sigue yendo por PR** con CI verde — la velocidad viene de no esperar aprobación
   cruzada en los módulos propios, no de saltarse el PR o el CI.
2. **No romper tests existentes.** Si un ajuste rompe un test de comportamiento, se arregla el código, no
   el test.
3. **Sin datos inventados** en lo que se muestra como real (mantener el criterio de todo el proyecto:
   mock aislado con `// TODO` donde no hay backend, nunca cifras fabricadas presentadas como reales).
4. **Verificar la rama antes de commitear** (el "ghost checkout" sigue activo hasta que se cace post-pitch):
   `git branch --show-current` + `git reflog` antes de cada commit.
5. **Plan B:** mantener siempre una versión desplegable de la app para la presentación.
6. Si un hallazgo de pruebas **cruza al dominio del otro**, se reporta — no se corrige en el dominio ajeno.

---

## Después del pitch

Esta división relajada es **temporal, solo para el pulido pre-presentación.** Pasada la demo, vuelve la
regla normal: contract-first, coordinación en cambios cross-dominio, y la caza del "ghost checkout" como
prioridad. Los módulos que quedaron diferidos (Voluntariado, Libro público/Transparencia, Reporte exógeno
real, RF14 del certificado, correo HTML) se retoman según el roadmap de olas.
