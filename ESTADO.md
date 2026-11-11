# Estado de Tabula

Documento vivo. **Cada chat que trabaje en Tabula lo lee al empezar y lo actualiza al terminar**
(sección «Últimos cambios» arriba del todo, y «Pendiente» / «Problemas conocidos» si cambian).

_Última actualización: 2026-11-12_

## Resumen

Cuaderno docente (PWA, HTML + JS sin compilación) para maestros de Primaria en Andalucía.
Publicada con GitHub Pages desde `main` (raíz). Datos en el dispositivo (IndexedDB/localStorage) y,
con sesión de Google, en Firebase (proyecto `mis-apps-educativas`, compartido con Barri, Lectori, Charta…).
Módulos y estructura: ver `README.md`.

## Últimos cambios

- **2026-11-12 · Rediseño, fase 4 (Ajustes y «Más»)**
  - *Ajustes* es ahora un índice de 7 filas con subpantallas en `#/ajustes/<seccion>` (Perfil · Apariencia · Evaluación ·
    Curso · Seguridad · Cuenta y datos · Ayuda), cada una con «‹ Ajustes» para volver. Cada sección crea solo lo suyo
    (y limpia sus suscripciones). Apariencia incluye la barra inferior; Curso, calendario escolar y nuevo curso;
    Seguridad, bloqueo y acceso de asistente; Cuenta y datos, sesión, estado de tus datos y restaurar copia.
    El router (`parseHash` en `js/app.js`) pasa la subsección como `?seccion=`; la búsqueda y los enlaces
    (Encuestas «Ir a Ajustes», «Revisar» del asistente, «Ir a Cuenta…») van directos a su sección.
    Lógica pura en `js/ajustes-model.js`; vista en `js/views/ajustes.js`.
  - *Más*: cuadrícula de 2 columnas con icono y nombre (sin descripciones), apps amigas en fila de 4, y «Ajustes» + «Barra
    inferior» al final; cabe entera en 390 × 844 con la barra inferior visible.
  - *Recordatorio de copia*: desaparece el aviso flotante; ahora es una línea discreta en «Hoy» («Aún no tienes copia… ·
    Hacer copia» → `#/ajustes/cuenta`, con ✕ que lo silencia una semana). Mismas condiciones que antes (sin cuenta, con
    datos, más de 30 días sin copia).
  - Pruebas: `tests/ajustes.test.mjs`; `tests/desbordamiento.py` mide también las 7 subpantallas de Ajustes.
    `sw.js` → `tabula-v50`.
- **2026-11-12 · Rediseño, fase 3 (Cuaderno y Planificación)**
  - *Barra de contexto compartida*: una sola fila «1º Demo · Matemáticas · 1.ª ev. ▾» en la línea superior de la cabecera
    (no ocupa piso propio). Abre una hoja con Grupo · Evaluación · Área (primero las áreas con cuaderno/situaciones);
    cada toque se aplica al momento y «Listo» queda fijo abajo. Sustituye al desplegable de grupo, las píldoras de área
    (y su «+ Área») y el selector de trimestre. La última elección se comparte entre ambas vistas.
    Archivos: `js/contexto-model.js` (lógica pura), `js/views/contexto.js` (barra y hoja), estilos `.ctx-*` y `.ph-ctx` en `css/app.css`.
  - *Cuaderno*: «+ Actividad» y «⋯» (Configurar, Importar notas de Calculi, Exportar a CSV, Informes del grupo,
    «Anotar con niveles / con notas» con Deshacer). Bajo la cabecera solo el segmentado Actividades / Criterios / Competencias.
    Con los datos de ejemplo a 390 px la tabla sube de 243 a 164 px: 10 filas visibles en vez de 8.
  - *Planificación*: «Nueva situación» como acción principal; segmentado Situaciones / Programación. La evaluación de la
    barra manda en la línea de tiempo (fuera su selector propio) y en las tarjetas («Situaciones · 1.ª evaluación», con
    enlaces a las otras evaluaciones que tengan situaciones). La URL lleva `ev`; una situación nueva nace en esa evaluación.
    Programación (semana/mes) no cambia. Fuera `openAreaPicker`.
  - Pruebas: `tests/contexto.test.mjs`; `tests/desbordamiento.py` mide también la hoja de contexto y el «⋯» del Cuaderno.
    `sw.js` → `tabula-v49`.
- **2026-11-11 · Rediseño, fase 2 (Documentos)**
  - Cabecera: una sola acción «Añadir» que abre una hoja (Subir archivo · Google Drive · Enlace · Crear ficha (Charta) ·
    Pegar de Claude, cada una con su icono y explicación); el estado vacío usa el mismo botón. «⋯» → Seleccionar.
    Arrastrar, pegar y «Compartir → Tabula» siguen igual.
  - Biblioteca: buscador + «Filtros» (con contador) que abre una hoja con orden, favoritos, carpeta, etiqueta, tipo y grupo;
    bajo el buscador solo las píldoras de filtros activos con ✕. Fuera el desplegable de orden, la impresora y la fila de píldoras.
  - Selección: pulsación larga en una tarjeta (sin menú del sistema; desplazar no selecciona) o «⋯ → Seleccionar».
    Barra con «Imprimir juntos» y «Eliminar» (con confirmación y «Deshacer»); acciones en `SEL_ACTIONS`. Sale con ✕ o Escape.
  - Ficha: principal «Imprimir» (o «Abrir enlace» / «Abrir»; Charta: «Imprimir» que abre Charta), secundario «Programar»,
    y en «⋯» Abrir, Descargar, Ver en Drive y Eliminar. Carpeta, etiquetas, grupo, área, copias y notas plegados en «Detalles».
  - Para imprimir: un único «Imprimir lo de hoy» (si hay varios combinables pregunta «Uno a uno» / «Todo junto (doble cara)»;
    con uno, directo). Cada fila: «Imprimir» (o «Abrir») + «⋯» (Marcar como impreso, Editar, Quitar de la cola).
  - Lógica pura: `activeFilters`, `clearFilter`, `toggleOrdered`, `queueItemsOf` (`js/documents.js`), `printTodayPlan`
    (`js/combine-model.js`); pruebas en `tests/documentos.test.mjs`. `tests/desbordamiento.py` mide también las hojas abiertas.
    Iconos nuevos `clipboard` y `filter` en `js/ui.js`. `sw.js` → `tabula-v48`.
- **2026-11-11 · Rediseño, fase 1 (piezas comunes y cabecera única)**
  - Piezas nuevas en `js/ui-kit.js`: `pageHead` (línea superior + título; a la derecha solo acción principal y «⋯»),
    `openMenu` (menú «⋯» accesible) y `openActionSheet` (hoja de acciones sobre `openSheet`). Todas las vistas usan
    `pageHead`; lo que sobraba en las cabeceras va al «⋯» (Documentos: Crear ficha, Pegar de Claude, Drive, Enlace;
    Cuaderno: Configurar, Calculi, Exportar; Hoy: En clase; En clase: Dictar y Modo pizarra; Grupo y Programa: Editar…).
    Documentos ya no desborda a 390 px.
  - Guía rápida: ya no es una tarjeta; es «¿Cómo funciona?» en la cabecera (o en «⋯») y abre una hoja. Sin
    «Entendido / Desactivar»; el interruptor de Ajustes sigue mandando. `js/guide.js`, `js/views/ajustes/guia.js`.
  - `css/app.css`: escala `--s-1…--s-6`, botón normal con relleno suave sin borde (`btn-outline` para contorno),
    lista sin tarjeta (`.list`), estilos de menú y hoja de acciones.
  - Pruebas: `tests/diseno.test.mjs`; comprobación en navegador `tests/desbordamiento.py` (ninguna ruta desborda a 360/390).
- **2026-11-11 · Plan de rediseño**: análisis de la interfaz en móvil y plan por fases en `PLAN-DISENO.md`
  (más minimalista: una acción principal por pantalla, menos botones, Documentos primero). Sin cambios de código.
- **2026-11-11 · Borrados que reaparecían y cambio de cuenta**
  - *Marcas de borrado*: lo borrado con la cuenta asociada pero sin conexión con la nube se apunta
    (`tabula:v1:borrados`) y al reconectar se borra también de la nube (salvo que allí se editara después).
    Deshacer quita la marca. Además se guarda desde cuándo hay cambios sin enviar (`tabula:v1:dirtySince`,
    con 10 min de margen): lo que no está en la nube y es anterior se borró en otro dispositivo y ya no revive.
    Al combinar se pregunta al servidor (`getDocsFromServer`, 8 s); si no responde, se usa la caché y se sube
    todo lo que falte (más vale que algo reviva que perderlo). Restaurar una copia sin conexión sube todo.
    Lógica pura en `planCombinar` / `nuevoDesde` (`js/datos-model.js`); `js/store.js`, `js/sync.js`.
  - *Entrar con otra cuenta*: si el dispositivo tiene cambios sin subir de la cuenta anterior, ya no se borran:
    no entra y Ajustes → Cuenta avisa con «Descargar copia», «Entrar con la cuenta anterior», «Cancelar» o
    «Borrar y entrar» (con doble confirmación). Sin cambios pendientes, todo sigue igual. Se guarda el correo
    de la cuenta (`syncEmail`, solo local). Archivos: `js/sync.js` (`resolverCambioCuenta`),
    `js/views/ajustes/cambio-cuenta.js`, `js/views/ajustes.js`.
  - Probado en Chrome sin cabeza con un Firebase simulado (reconectar con borrados, otra cuenta, forzar).
- **2026-11-11 · Seguridad de los datos (auditoría)**
  - *Cerrar sesión ya no borra a ciegas*: `signOutAndClear` espera `waitForPendingWrites` (8 s máx.) y revisa red,
    estado de error, cambios sin combinar y archivos sin subir. Si no puede asegurar que todo está en la nube, no cierra
    sesión ni borra: avisa con los motivos y ofrece «Descargar copia», «Volver a comprobar», «Cancelar» o
    «Borrar de todos modos». En la pantalla de bloqueo igual, pero sin copia (saltaría el PIN) y el PIN solo se quita
    si de verdad se borra. Archivos: `js/datos-model.js` (lógica pura), `js/sync.js` (`pendingStatus`),
    `js/views/ajustes/cerrar-sesion.js`, `js/views/ajustes/copia.js`, `tests/datos.test.mjs`.
    De paso: se veía la palabra «null» en Ajustes → Cuenta con sesión iniciada; corregido.
  - *IndexedDB que falla ya no deja la app «vacía»*: `store.ready()` distingue «no existe» (modo antiguo en
    localStorage, sin aviso) de «existe pero falló» (`decidirAlmacen`). Si este dispositivo ya guardaba en IndexedDB
    (marca `tabula:v1:almacen`), la app no arranca ni sincroniza ni escribe: pantalla «No puedo leer tus datos.
    No añadas nada y reintenta» con botón Reintentar. Si nunca la usó, sigue en localStorage con una franja de aviso.
    Además: tiempo límite de 10 s al abrir, y franja «No puedo guardar tus cambios» si un guardado falla a mitad de
    sesión (antes solo iba a la consola). Estado en `store.almacen`, `store.onAlmacen`, `store.reintentar()`.
    Archivos: `js/store.js`, `js/views/almacen-aviso.js`, `js/datos-model.js`, `css/extra.css`.
  - *Ajustes → «Estado de tus datos»*: última copia, almacenamiento protegido (sí/no, con «Pedir protección»),
    espacio usado, sincronización y cambios por subir («Ninguno» / «Sí» / «Sin confirmar»), con «Hacer copia ahora».
    La tarjeta «Copia de seguridad» queda solo para restaurar. Al arrancar se pide `navigator.storage.persist()`
    sin molestar (en Firefox, que pregunta, solo desde el botón). Archivos: `js/views/ajustes/estado-datos.js`,
    `js/datos-model.js` (`filasEstado`), `js/app.js`, `css/app.css`.
- **2026-11-11 · Documentos → «Imprimir juntos»**: elegir varios documentos (PDF, imágenes, fichas HTML)
  e imprimirlos en un solo trabajo, en el orden elegido; con «Doble cara» en la ventana de impresión salen
  uno por delante y otro por detrás del mismo folio. Opción «Cada documento en una hoja nueva» (añade blancas).
  Desde la Biblioteca (botón «Imprimir juntos», selección por toques) y desde «Para imprimir» (lo de hoy).
  Archivos: `js/combine-model.js` (lógica pura, probada), `js/views/documentos/combine.js` (hoja e impresión).
  Los PDF se rasterizan con pdf.js a ~200 ppp; las fichas HTML van en shadow DOM declarativo dentro de un iframe sin scripts.
- **Antes**: integración con Charta (crear fichas desde Tabula y recibirlas como documentos), notas de Calculi
  en el Cuaderno, códigos cifrados, informe para la Junta de evaluación, apps amigas (Barri, Lectori, Fori),
  Drive en Documentos, dictado por voz, pruebas automáticas. Detalle en `git log`.

## Pendiente / ideas

- **Rediseño**: fases 1 a 4 hechas. Siguen las fases de `PLAN-DISENO.md` (5 resto de pantallas → 6 repaso).
  Fase 3: la vista «Informes» del Cuaderno conserva su propio desplegable de grupo y segmentado (sin tocar). Pendiente de la fase 1: la guía «desplegada dentro de los estados vacíos»
  (tampoco se puso en los de Documentos). Documentos: la pulsación larga solo está probada en Chrome con toque simulado;
  falta probarla en iPhone/iPad y Android reales. «Mover a carpeta» en la selección, sin hacer.
- **Datos (de la auditoría, sin hacer)**:
  - La copia de seguridad se arma entera en memoria (`createBackup`/`makeZip`/`readZip`): con muchos archivos puede
    agotar la memoria del móvil. Escribirla y leerla por partes (streams). *Opus.*
  - Cifrado opcional de la copia con contraseña, reutilizando `js/codigos-crypto.js`. *Opus o Sonnet.*
- «Imprimir juntos»: no probado aún en iPad/iPhone ni con impresora real.
- App con QR para que el profesorado envíe evidencias de STEAM 4.0 y lleguen a Tabula (idea del usuario).

## Problemas conocidos

- Las marcas de borrado solo cubren lo borrado *sin conexión con la nube*; si dos dispositivos editan y borran
  el mismo elemento a la vez, gana la edición. Sin probar aún con Firebase real ni en iPhone/iPad.
- «Estado de tus datos» y los avisos del almacén solo están probados en Chrome (simulando los fallos); falta iPhone/iPad.
- pdf.js se carga desde cdnjs: sin conexión la primera vez no hay miniaturas de PDF ni «Imprimir juntos» con PDF.
- Las fichas de Charta no se imprimen desde Tabula (se abren en Charta).
