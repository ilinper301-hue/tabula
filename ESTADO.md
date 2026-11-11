# Estado de Tabula

Documento vivo. **Cada chat que trabaje en Tabula lo lee al empezar y lo actualiza al terminar**
(sección «Últimos cambios» arriba del todo, y «Pendiente» / «Problemas conocidos» si cambian).

_Última actualización: 2026-11-11_

## Resumen

Cuaderno docente (PWA, HTML + JS sin compilación) para maestros de Primaria en Andalucía.
Publicada con GitHub Pages desde `main` (raíz). Datos en el dispositivo (IndexedDB/localStorage) y,
con sesión de Google, en Firebase (proyecto `mis-apps-educativas`, compartido con Barri, Lectori, Charta…).
Módulos y estructura: ver `README.md`.

## Últimos cambios

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

- **Datos (de la auditoría, sin hacer)**:
  - Borrados que reaparecen: al combinar con la nube (`attach` en `js/sync.js`) lo borrado sin conexión vuelve,
    porque no hay marcas de borrado (tombstones). Hay que guardar los borrados y aplicarlos al fusionar. *Opus.*
  - La copia de seguridad se arma entera en memoria (`createBackup`/`makeZip`/`readZip`): con muchos archivos puede
    agotar la memoria del móvil. Escribirla y leerla por partes (streams). *Opus.*
  - Cifrado opcional de la copia con contraseña, reutilizando `js/codigos-crypto.js`. *Opus o Sonnet.*
  - Al iniciar sesión con otra cuenta distinta de la última (`prevUid` en `attach`), los datos locales se borran sin
    comprobar si estaban subidos. Aplicar la misma comprobación que al cerrar sesión. *Sonnet.*
- Arreglar: en móvil estrecho (~390 px) los botones de la cabecera de Documentos («Crear ficha», «Pegar de Claude»,
  «Drive», «Añadir enlace», «Subir») no caben y desbordan por la derecha (la página se ensancha a ~415 px).
- «Imprimir juntos»: no probado aún en iPad/iPhone ni con impresora real.
- App con QR para que el profesorado envíe evidencias de STEAM 4.0 y lleguen a Tabula (idea del usuario).

## Problemas conocidos

- «Estado de tus datos» y los avisos del almacén solo están probados en Chrome (simulando los fallos); falta iPhone/iPad.
- pdf.js se carga desde cdnjs: sin conexión la primera vez no hay miniaturas de PDF ni «Imprimir juntos» con PDF.
- Las fichas de Charta no se imprimen desde Tabula (se abren en Charta).
