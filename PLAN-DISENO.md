# Plan de rediseño: Tabula más minimalista

Análisis hecho el 2026-11-11 sobre capturas reales a 390 × 844 px (Chrome sin cabeza, grupo «1º Demo»).
Cada fase es un chat independiente. Al terminar una fase: márcala aquí como hecha y resume en `ESTADO.md`.

## Diagnóstico (qué se ve hoy)

| Pantalla | Controles visibles sin desplazar | Problema principal |
|---|---|---|
| Documentos | 15 (y la página se ensancha a 415 px) | 5 botones de añadir en la cabecera, dos con el mismo icono; 3 formas de imprimir |
| Cuaderno | 28 | 4 pisos de selectores antes de la tabla; 4 botones de solo icono en la cabecera |
| Calendario | 12 | Aviso del calendario escolar + navegación + pestañas antes del contenido |
| Tutoría / En clase | 11 | Dos filas de pestañas seguidas |
| Ajustes | 13 tarjetas, 4366 px de alto | Todo en una sola página interminable |
| Más | 1935 px de alto | Lista con descripciones: hay que desplazar para ver 13 secciones |

Problemas comunes a toda la app:

1. **Cabeceras distintas en cada pantalla.** La acción principal está arriba a la derecha (Calendario, Grupos),
   debajo a todo el ancho (Planificación), debajo a la izquierda (Programas, Encuestas, Códigos) o repartida en
   iconos sin texto (Cuaderno). Documentos y Ajustes no tienen la línea superior («eyebrow») en móvil.
2. **La «Guía rápida» ocupa cerca del 40 % de la primera pantalla** en todas las secciones, con dos botones propios.
3. **Selectores apilados y en tres estilos** (pestañas segmentadas, píldoras y desplegables nativos) sin regla
   de cuándo va cada uno.
4. **Demasiados botones con el mismo peso**: casi todos llevan borde, así que ninguno destaca.
5. **Cajas dentro de cajas**: tarjetas con borde y sombra para casi todo; falta aire.

## Reglas de diseño (valen para todas las fases)

- **Una acción principal por pantalla** (botón de color). El resto: texto/fantasma o dentro de un menú «⋯».
- **Cabecera única**: línea superior + título a la izquierda; a la derecha, como mucho, acción principal y «⋯».
- **Máximo dos pisos de controles** entre el título y el contenido.
- **Cada control, un uso**: segmentado = cambiar de vista (máx. 3 opciones); píldoras = filtrar;
  desplegable nativo = solo dentro de formularios y hojas.
- **Nada de botones de solo icono** salvo buscar, cerrar, «⋯», favorito y atrás.
- **Lo secundario, a una hoja inferior** (`openSheet`): filtros, orden, opciones avanzadas, metadatos.
- **Menos cajas**: las listas van sin tarjeta, con separadores finos; tarjeta solo para bloques independientes.
- Ninguna ruta puede tener desplazamiento horizontal a 360 px ni a 390 px.

## Fase 1 · Piezas comunes — *Opus, esfuerzo alto* — ✅ hecha (2026-11-11)

> Hecho: `js/ui-kit.js` (`pageHead`, `openMenu`, `openActionSheet`), estilos en `css/app.css`, guía en hoja,
> `pageHead` en todas las vistas y `tests/diseno.test.mjs` + `tests/desbordamiento.py`. Queda para las fases 2–5:
> mostrar la guía desplegada dentro de los estados vacíos (al rehacer cada uno).

Base de todo lo demás. No cambia funciones, solo estructura visual.

- En `js/ui.js` (o `js/ui-kit.js` nuevo): `pageHead({ eyebrow, title, primary, menu })`,
  `openMenu(anchor, items)` (menú «⋯» accesible: foco, Escape, flechas) y
  `openActionSheet(title, [{ icon, label, desc, run }])` sobre `openSheet`.
- `css/app.css`: escala de espaciado (`--s-1…--s-6`), variantes de botón claras (`btn-primary`, `btn` sin borde
  por defecto → fantasma, `btn-outline` solo donde haga falta), lista sin tarjeta (`.list` con separadores).
- Guía rápida (`js/guide.js`): pasa a ser un enlace discreto «¿Cómo funciona?» en la cabecera que abre la guía en
  una hoja. Solo se muestra desplegada dentro de los estados vacíos. Se elimina el par «Entendido / Desactivar».
- Aplicar `pageHead` a todas las vistas (`js/views/*.js`) sin tocar aún su contenido.
- Prueba nueva con Playwright (o en `tests/` como estructura): ninguna ruta desborda a 360 y 390 px.

## Fase 2 · Documentos — *Opus, esfuerzo alto* — ✅ hecha (2026-11-11)

> Hecho: «Añadir» único con hoja, «Filtros» en hoja con píldoras de filtros activos, selección por pulsación larga o
> «⋯ → Seleccionar» (Imprimir juntos y Eliminar), ficha con «Imprimir»/«Programar»/«⋯» y «Detalles» plegado,
> «Imprimir lo de hoy» único y filas con «⋯». Sin desbordamiento a 360/390 (también con hojas abiertas).
> Sin hacer: «Mover a carpeta» desde la selección y la guía desplegada en los estados vacíos.

Archivos: `js/views/documentos.js`, `documentos/library.js`, `queue.js`, `detail.js`, `combine.js`, `css/documentos.css`.

- **Añadir**: los 5 botones de la cabecera → un solo «+ Añadir» que abre una hoja con: Subir archivo · Google Drive ·
  Enlace · Crear ficha (Charta) · Pegar de Claude, cada uno con icono distinto y una línea de explicación.
  Arrastrar, pegar y «Compartir → Tabula» siguen igual. El estado vacío usa el mismo botón único.
- **Biblioteca**: buscador a todo el ancho + un botón «Filtros» (con contador si hay alguno activo) que abre una
  hoja con orden, favoritos, carpeta, etiqueta, tipo y grupo. Bajo el buscador solo se ven las píldoras de los
  filtros activos, con ✕ para quitarlos.
- **Selección**: se entra con pulsación larga en una tarjeta o desde «⋯ → Seleccionar». La barra inferior de
  selección ofrece «Imprimir juntos» (y queda preparada para mover a carpeta / eliminar).
- **Imprimir, una sola idea**: en la ficha del documento, principal «Imprimir» y secundario «Programar»;
  Abrir, Descargar y Eliminar pasan a «⋯». Carpeta, etiquetas, grupo y área, plegados bajo «Detalles».
- **Para imprimir**: un único botón «Imprimir lo de hoy» que pregunta en una hoja «Uno a uno» o «Todo junto
  (doble cara)». Cada fila: «Imprimir» + «⋯» (Marcar como impreso, Editar, Quitar) en vez de 4 botones.
- Resuelve el desbordamiento a 390 px apuntado en `ESTADO.md`.

## Fase 3 · Cuaderno y Planificación — *Opus, esfuerzo alto (delicado: es la zona de evaluación)* — ✅ hecha (2026-11-12)

> Hecho: `js/contexto-model.js` + `js/views/contexto.js`. La barra va en la línea superior de la cabecera (así no suma
> un piso) y abre una hoja Grupo · Evaluación · Área; la elección se comparte entre ambas vistas. Cuaderno: «⋯» con
> Configurar, Importar (Calculi), Exportar, Informes y «Anotar con niveles/notas»; un solo segmentado. Planificación:
> «Nueva situación» + Situaciones/Programación; la evaluación de la barra manda en la línea de tiempo y en las tarjetas.
> Tabla del Cuaderno a 390 px: de 8 a 10 filas visibles. Sin tocar: la vista «Informes» (su propio selector de grupo).

- **Barra de contexto única** compartida por ambas vistas: una sola fila «1º Demo · Matemáticas · 1.ª ev.» que
  abre una hoja para cambiar grupo, área y evaluación. Sustituye al desplegable de grupo, las píldoras de área
  y el selector de trimestre.
- Cuaderno: cabecera con «+ Actividad» y «⋯» (Configurar, Importar, Exportar, Informes, cambiar tipo de tabla).
  Queda un solo segmentado: Actividades / Criterios / Competencias.
- Planificación: «Nueva situación» como acción principal de la cabecera; segmentado Situaciones / Programación.
- Comprobar con datos de ejemplo que la tabla gana al menos dos filas visibles en móvil.

## Fase 4 · Ajustes y «Más» — *Sonnet, esfuerzo medio* — ✅ hecha (2026-11-12)

> Hecho: índice de Ajustes con 7 subpantallas (`#/ajustes/<seccion>`, `js/ajustes-model.js`), «Más» en cuadrícula que cabe
> en una pantalla y recordatorio de copia como línea en «Hoy» (sin aviso flotante). Queda a medias: la guía desplegada
> en estados vacíos (fase 1) sigue pendiente.

- **Ajustes** como índice de filas (estilo ajustes del teléfono) con subpantallas:
  Perfil · Apariencia (modo, color, barra inferior) · Evaluación · Curso (calendario escolar, nuevo curso) ·
  Seguridad (bloqueo, acceso de asistente) · Cuenta y datos (cuenta, estado de tus datos, copias) · Ayuda (guía, ejemplo).
  Rutas `#/ajustes/<seccion>`; el aviso de copia de seguridad enlaza directo a «Cuenta y datos».
- **Más**: cuadrícula de 2 columnas con icono y nombre (sin descripción), agrupada por los 4 bloques actuales,
  que quepa en una pantalla; Ajustes y apps amigas al final.
- Recordatorio de copia: en vez de aviso flotante sobre el contenido, una línea discreta en «Hoy».

## Fase 5 · Resto de pantallas — *Sonnet, esfuerzo medio (una o dos por chat)* — ✅ hecha (2026-11-12)

> Hecho: Calendario, En clase (rejilla), Tutoría (píldora) y estados vacíos cortos. Hoy ya no tenía el botón del reloj.

- **Calendario**: «Hoy ‹ ›» y Semana/Mes/Horario en una sola fila; el aviso del calendario escolar se reduce a
  una línea con enlace y desaparece al cargarlo. Quitar «+ Evento» repetido en cada día (se añade tocando el día).
- **Tutoría**: el filtro «Todo el grupo / Sin tutoría» pasa a píldora de filtro; el resumen, a una línea.
- **En clase**: las herramientas como rejilla de iconos al entrar, en vez de pestañas que se cortan por la derecha;
  micrófono y proyector a «⋯».
- **Hoy**: el botón del reloj sin etiqueta pasa a la lista o a «⋯».
- **Programas, Encuestas, Códigos, Grupos, Tareas**: solo adoptar cabecera única y estados vacíos más cortos
  (un icono, una frase, un botón).

## Fase 6 · Repaso final — *Sonnet, esfuerzo bajo*

Modo oscuro, tablet (768 px) y ordenador; foco y lectores de pantalla en menús y hojas nuevas; borrar CSS que
ya no se use; actualizar `README.md`.

## Cómo pedir cada fase

Abrir chat nuevo en el proyecto y escribir: «Ejecuta la fase N de `PLAN-DISENO.md`». Publicar al terminar cada
fase (no a medias) y enviar capturas de antes y después a 390 px.
