# AdoptaFácil

## Manual de Usuario — Organizaciones

_Conéctalos. Cambia sus vidas._

Este manual es para tu equipo si representas a una organización de rescate animal (refugio, fundación)
en AdoptaFácil: aquí gestionas tus animales, evalúas adopciones, recibes donaciones y apadrinamientos,
publicas campañas, coordinas voluntariado y personalizas tu portal público. Si buscas el manual para
personas que adoptan/donan, consulta el _Manual de Usuario — Personas_.

Las capturas de este manual provienen de sesiones reales de la aplicación, con datos de demostración.
Las secciones marcadas _(pendiente captura)_ describen funciones reales y operativas que aún no tienen
una captura incluida en esta versión.

## Índice

[TOC]

## 1. Roles dentro de tu organización

AdoptaFácil es gratuita para las organizaciones. Dentro de tu organización puedes tener varias cuentas,
cada una con un rol distinto:

| Rol                                       | Para qué sirve                                                                                                                                         |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Owner**                                 | El dueño de la cuenta de la organización. Único que puede avanzar/retroceder la formalización y editar el representante legal.                         |
| **Administrator**                         | Gestión completa del día a día (perfil, documentos, animales, adopciones, donaciones, campañas, apadrinamientos, voluntariado, recursos, marketplace). |
| **Operator**                              | Gestión operativa (animales, adopciones, donaciones, campañas, recursos, marketplace) sin acceso a formalización/documentos.                           |
| **Volunteer** / **TemporaryCollaborator** | Acceso acotado según la tarea que apoyan.                                                                                                              |
| **Veterinarian**                          | Puede registrar eventos en el expediente clínico de los animales.                                                                                      |
| **ReadOnlyAuditor**                       | Ve casi todo (documentos, animales, campañas, apadrinamientos) sin poder editar nada — pensado para auditoría interna.                                 |

Cada rol ve solo el menú que le corresponde; una acción que tu rol no permite se rechaza con un aviso
claro, nunca con un error confuso.

## 2. Primeros pasos

Al iniciar sesión con una cuenta de organización ves un menú distinto al de una Persona, con las
herramientas de gestión.

![Inicio de una organización](img/16-inicio-organizacion.png)

### Mi organización (perfil)

Se llega haciendo clic sobre el nombre de la organización, en la parte superior del menú lateral. Ahí
administras: nombre, el "slug" de tu portal público (`/o/tu-organizacion`), NIT, razón social y
descripción. La pantalla muestra el "% completo" del perfil y si ya está publicado.

![Perfil de la organización](img/28-organizacion-perfil.png)

El perfil tiene además las pestañas Ubicación, Contacto, Imágenes y redes, y Acerca de nosotros. Desde
su encabezado accedes también a Formalización, Personalización y "Ver portal público".

_Al registrar o editar tu organización, el sistema valida automáticamente que el NIT (o un nombre muy
similar) no pertenezca ya a otra organización registrada — si hay coincidencia, el registro se bloquea y
se te ofrece solicitar vinculación, recuperar acceso o abrir una incidencia con el equipo de AdoptaFácil,
en vez de crear un duplicado silenciosamente._

## 3. Formalización y confianza

La formalización demuestra, con documentos, que tu organización es una entidad real y confiable. Avanza
en etapas: **Informal → En proceso → Formalizada → ESAL → ESAL + RTE**. Cada etapa superada sube el
"Nivel de verificación" visible en tu portal público — una señal de confianza para quien te visita.

![Formalización de la organización](img/29-organizacion-formalizacion.png)

Avanzar (o retroceder) de etapa requiere tener los documentos correspondientes aprobados, y solo puede
hacerlo el **Owner** — retroceder, además, exige explicar el motivo.

### Representante legal y firma

Desde Formalización registras al representante legal vigente de tu organización, incluyendo su firma.
La firma se cifra antes de guardarse (AES-256-GCM) y **nunca** se expone en texto plano por ningún
endpoint ni en ningún reporte — solo se usa para respaldar el certificado de donación real y la
formalización. Si la firma no cumple los requisitos mínimos de validación, el documento queda en estado
"Observado" con el motivo explicado. _(Pendiente captura.)_

### Documentos institucionales

Se administran aquí: Certificado de existencia y representación legal, RUT, Documento del representante
legal, y espacio para "Otro documento". Cada uno tiene su propio estado — Pendiente, En revisión,
Aprobado, Rechazado, Observado, o Vencido si pasó su fecha de vigencia.

![Documentos institucionales — todo aprobado](img/30-organizacion-documentos.png)

![Documentos institucionales — uno pendiente](img/30b-organizacion-documentos-pendiente.png)

_Quien revisa y decide sobre estos documentos es el equipo de AdoptaFácil (plataforma), no tu propia
organización._

### Verificación DIAN

Si tu organización ya está en etapa Formal o ESAL, puedes solicitar la verificación ante la DIAN desde
esta misma sección. Mientras se procesa, el estado se muestra "En procesamiento" y el sistema reintenta
automáticamente (a los 5 minutos, 30 minutos, 2 horas y 24 horas) antes de marcar un error definitivo. Si
tu organización todavía es Informal, la verificación se bloquea hasta que avances de etapa.
_(Pendiente captura.)_

## 4. Gestión de animales

A la izquierda hay un listado con buscador, filtro por especie y los botones "Importar Excel" (para dar
de alta varios animales a la vez) y "Registrar animal"; cada fila muestra su estado. Al seleccionar un
animal, a la derecha se abre su ficha: foto, nombre, raza, sexo y edad, con accesos a Editar, Expediente
médico, Eliminarlo o gestionar su Apadrinamiento.

![Gestión de animales](img/31-animales-gestion.png)

La ficha tiene tres pestañas: **Carnet** (cartilla de vacunación/identificación, descargable en PDF real),
**Registro clínico** (historial de consultas, vacunas y procedimientos — un rol Veterinario agrega
eventos nuevos) y **Documentos** (aún "Disponible próximamente", no guarda archivos todavía).

![Registro clínico de un animal](img/32-animales-registro-clinico.png)

### Recordatorios

La bandeja de recordatorios reúne avisos pendientes (por ejemplo, vencimientos de vacunas). En una
organización recién creada aparece vacía.

![Recordatorios](img/33-recordatorios.png)

## 5. Tablero de adopciones

Las solicitudes que llegan a tu organización se organizan en un tablero con cuatro columnas: Nuevas, En
evaluación, Aprobada y Rechazada.

![Tablero de adopciones](img/17-kanban-adopciones.png)

"Ver detalle" abre la ficha completa del solicitante antes de decidir.

![Detalle del solicitante](img/18-kanban-detalle-solicitante.png)

Un miembro de tu propia organización **no puede** postular a un animal de tu propia organización — el
sistema lo bloquea automáticamente (conflicto de interés). Una vez aprobada una solicitud, puedes generar
el contrato de adopción (con firma electrónica) y dar seguimiento post-adopción con hitos y evidencias.

## 6. Donaciones recibidas

La contraparte de "Mis donaciones" del donante: todo lo que has recibido, con el nombre del donante (una
vez emitido el recibo) y el monto neto que efectivamente te llega, ya descontados comisión de plataforma,
IVA sobre esa comisión y comisión de la pasarela de pago.

![Donaciones recibidas](img/19-donaciones-recibidas.png)

**Importante sobre el dinero — atención, cambio temporal:** el modelo de AdoptaFácil es que la
plataforma nunca custodia tus fondos: el recaudo se consolida (ahora vía MercadoPago) y se
dispersa a tu cuenta bancaria registrada al día hábil siguiente (T+1). **Esa dispersión automática
está pausada mientras MercadoPago aprueba un permiso especial ("Disbursements") sobre la cuenta de
la plataforma** — sin esa aprobación, el dinero recaudado por MercadoPago queda en la cuenta de la
plataforma sin una forma automática de transferirlo a la tuya. En cuanto MercadoPago apruebe el
permiso, la dispersión automática vuelve a funcionar. Mientras tanto, si tienes donaciones
recaudadas pendientes de recibir, contacta al equipo de AdoptaFácil.

## 7. Gestión de campañas

Distinta al portafolio público de campañas: aquí creas y editas tus propias campañas de recaudación. En
una organización nueva, la lista aparece vacía.

![Campañas de la organización (vacío)](img/34-organizacion-campanas.png)

Al crear una campaña se pide título, descripción, categoría, meta en pesos colombianos y fecha límite.
Una vez creada, puedes adjuntarle "evidencias de rendición" — comprobantes de en qué se usó el dinero
recaudado.

![Nueva campaña](img/35-organizacion-campanas-nueva.png)

**Una evidencia de rendición, una vez creada, no se puede editar ni borrar** — queda protegida de forma
permanente (append-only), incluso a nivel de base de datos, para que la rendición de cuentas sea
confiable. Cualquier persona puede consultar el reporte de meta, avance y evidencias de una campaña sin
necesidad de iniciar sesión.

![Portafolio de campañas](img/21-campanas-portafolio.png)
_Portafolio público de campañas activas de todas las organizaciones._

## 8. Apadrinamientos recibidos

Aquí administras todos los apadrinamientos activos sobre tus animales. Arriba hay tarjetas de resumen
(padrinos activos, ingreso mensual total, animales apadrinados, pagos fallidos) y abajo una tabla con
cada padrino, el animal, su aporte mensual, el estado y acciones: Suspender, Registrar fallecimiento y
Cancelar.

![Apadrinamientos recibidos](img/36-organizacion-apadrinamientos-recibidos.png)

Si el cobro mensual de un padrino falla, el sistema reintenta automáticamente durante varios días,
notificando al padrino en cada intento; si se agotan los reintentos, el apadrinamiento pasa a
**Suspendido** de forma automática y ambas partes quedan notificadas — esto ya funciona de verdad, no es
solo un estado visual.

"Registrar fallecimiento" marca al animal como fallecido, suspende automáticamente todos sus
apadrinamientos activos y notifica a cada padrino con un mensaje honesto (que el animal falleció y que
tú te pondrás en contacto). Reasignar el padrino a otro animal, devolverle el mes en curso, o enviarle
un mensaje personalizado siguen siendo una entrega futura — hoy la acción solo deja constancia del hecho
y suspende el apadrinamiento; el resto lo coordinas tú directamente con cada padrino.

## 9. Voluntariado

Publica oportunidades de voluntariado, revisa las inscripciones y aprueba las horas que cada voluntario
registra. Si un voluntario es estudiante cursando su servicio social (grados 10°–11°), el sistema calcula
automáticamente su avance hacia las 80 horas exigidas y habilita su certificado al completarlas.
_(Pendiente captura — módulo nuevo.)_

## 10. Banco de recursos

Publica las necesidades físicas de tu organización (comida, insumos, medicamentos); cualquier persona
puede ofrecerte una donación en especie contra esa necesidad desde "Necesidades recibidas". Coordinas la
entrega y dejas evidencia una vez recibida. Tus necesidades activas se muestran tanto en el listado
público general como dentro de tu propio portal (`/o/tu-organizacion`, sección "Necesita hoy").
_(Pendiente captura — módulo nuevo.)_

## 11. Marketplace

Publica tus productos (nombre, precio, stock, categoría e imágenes) en "Marketplace". Aparecen en el
catálogo público filtrado por tu organización y **también dentro de tu propio portal público**. Cada
producto muestra siempre visible el aviso de que AdoptaFácil no garantiza la entrega ni la calidad; el
contacto del comprador contigo es directo por WhatsApp, sin carrito ni pago en línea.
_(Pendiente captura — módulo nuevo.)_

## 12. Comunidad

Publica novedades, avisos de campaña o eventos en el feed cruzado de Comunidad, visible para todas las
personas de la plataforma. Solo puedes editar o borrar tus propias publicaciones; la moderación de
contenido inapropiado la ejerce el equipo de AdoptaFácil (plataforma), no tu organización. Cuando
publicas algo de tipo "campaña", se notifica automáticamente por correo a las personas que ya te han
donado antes. _(Pendiente captura — módulo nuevo.)_

## 13. Reputación

Solo las personas que hayan tenido una adopción, donación o apadrinamiento real contigo pueden
calificarte (1 a 5) y dejar una reseña — la plataforma lo verifica antes de aceptarla, no depende de la
buena fe de quien reseña. Cada reseña es visible en tu portal público una vez aprobada por el equipo de
AdoptaFácil. El indicador público (promedio y cantidad de reseñas) se calcula solo con las reseñas ya
aprobadas. _(Pendiente captura — módulo nuevo.)_

## 14. Personalización del portal

Desde "Mi organización" → "Personalización", eliges los colores de tu portal público sin tocar código,
incluido el radio de las esquinas desde una lista desplegable. Puedes guardar sin que ningún aviso de
contraste bloquee el guardado.

![Personalización del portal](img/20-personalizacion-portal.png)

Si configuras un subdominio propio (`tu-organizacion.adoptafacil.com`), tu portal resuelve directamente
por esa dirección; mientras no lo configures, `/o/tu-organizacion` sigue funcionando como respaldo.

### Qué se ve hoy en tu portal público

Tu portal público (`/o/tu-organizacion` o tu subdominio) ya muestra de forma real: tu perfil, el
indicador de transparencia (Nivel + % de formalización), tus animales en adopción, tu campaña activa, tu
catálogo de Marketplace y tus necesidades activas del Banco de recursos ("Necesita hoy").

## 15. Módulos próximamente

Dentro de "Documentos" quedan aún como "Disponible próximamente" (etiqueta "PRONTO"): **Transparencia
nacional** y **Reporte exógeno 2575**.

![Módulo próximamente](img/37-proximamente-voluntariado.png)

## 16. Seguridad y roles

Cada rol ve y hace solo lo que le corresponde: un Operator no puede tocar la formalización, un
ReadOnlyAuditor no puede editar nada, y ningún miembro de tu organización puede ver ni modificar datos de
otra organización — está garantizado a nivel de base de datos, no solo en la pantalla.

![Sin acceso](img/22-sin-acceso.png)

## 17. Preguntas frecuentes

**¿Cuánto cuesta usar AdoptaFácil?**
Nada. Registrarte y publicar es gratuito. La plataforma se sostiene con un pequeño porcentaje de apoyo
sobre las donaciones que tú mismo recibes — nunca sobre las adopciones ni por usar el marketplace o el
banco de recursos.

**¿AdoptaFácil retiene mi dinero en algún momento?**
Por diseño, no: el recaudo se consolida vía MercadoPago y se dispersa a tu cuenta bancaria
registrada al día hábil siguiente (T+1) — la plataforma nunca custodia saldos como modelo de
negocio. Ahora mismo, sin embargo, esa dispersión automática está pausada mientras MercadoPago
aprueba un permiso especial sobre la cuenta de la plataforma (ver sección 6) — es una limitación
temporal de la integración, no una decisión de negocio.

**¿Quién revisa mis documentos institucionales?**
El equipo de AdoptaFácil (roles de plataforma), no otra organización ni tu propio equipo.

**¿Qué pasa con el apadrinamiento si el animal muere?**
Al registrar el fallecimiento, el apadrinamiento pasa automáticamente a "Suspendido" y el padrino recibe
una notificación. Reasignarlo a otro animal o devolverle el mes en curso son pasos que hoy coordinas tú
directamente con el padrino — la plataforma todavía no los automatiza.

**¿Qué pasa si un Operator intenta acceder a Formalización?**
Ve un aviso de "Sin acceso" — el sistema deniega por defecto cualquier acción que el rol no tenga
explícitamente permitida.
