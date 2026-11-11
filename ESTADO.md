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

- Arreglar: en móvil estrecho (~390 px) los botones de la cabecera de Documentos («Crear ficha», «Pegar de Claude»,
  «Drive», «Añadir enlace», «Subir») no caben y desbordan por la derecha (la página se ensancha a ~415 px).
- «Imprimir juntos»: no probado aún en iPad/iPhone ni con impresora real.
- App con QR para que el profesorado envíe evidencias de STEAM 4.0 y lleguen a Tabula (idea del usuario).

## Problemas conocidos

- pdf.js se carga desde cdnjs: sin conexión la primera vez no hay miniaturas de PDF ni «Imprimir juntos» con PDF.
- Las fichas de Charta no se imprimen desde Tabula (se abren en Charta).
