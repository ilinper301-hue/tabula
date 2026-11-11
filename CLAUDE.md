# Instrucciones para Claude (repositorio Tabula)

## Al empezar y al terminar
1. Lee `ESTADO.md` (estado actual, pendientes, problemas conocidos) y, si hace falta, `README.md`.
2. Al terminar un cambio, **actualiza `ESTADO.md`**: añade una entrada arriba en «Últimos cambios»
   (fecha, qué, archivos principales) y ajusta «Pendiente» y «Problemas conocidos». Mantenlo breve:
   resume o borra entradas antiguas en vez de acumular.

## El usuario
- Maestro de Primaria en Andalucía; escribe en español. Responde en español, breve y por partes.
- Trabaja **solo desde el móvil** (no tiene ordenador): nada de pasos que exijan terminal o PC.
- No pide confirmación para cosas pequeñas: implementa, prueba y publica.
- Avisa cuando el chat se alargue demasiado y convenga abrir otro, indicando el esfuerzo recomendado y
  qué modelo usar: **Opus** para funciones nuevas grandes o delicadas, **Sonnet** para arreglos y cambios pequeños.
- Al proponer una tarea, di también si conviene hacerla en Opus o en Sonnet.

## Cómo trabajar en el código
- HTML + JavaScript (módulos ES) + CSS, **sin compilación ni dependencias npm**. Librerías externas solo por CDN
  y cargadas bajo demanda (p. ej. pdf.js en `js/files.js`).
- Una vista por pantalla en `js/views/*.js` y sus piezas en la carpeta del mismo nombre. Lógica pura (sin DOM)
  en módulos aparte para poder probarla con Node. Datos solo a través de `js/store.js`.
- Interfaz en español, accesible (aria-label, foco, teclado) y pensada primero para móvil/tablet; claro y oscuro
  usando solo variables de `css/app.css`.
- **Archivo nuevo** en `js/` o `css/` → añádelo a la lista de `sw.js` **y sube la versión** de `CACHE` (`tabula-vNN`).
  Si cambias archivos existentes, sube también la versión para que los móviles reciban la actualización.
- Pruebas: `node --test tests/*.test.mjs` (lógica y estructura). Deben pasar antes de publicar; añade pruebas
  para la lógica nueva. Si puedes, comprueba la interfaz con Chrome sin cabeza (Playwright) en tamaño móvil.
- Nunca subas datos del alumnado al repositorio.

## Publicar
- Rama de trabajo → commit → `git push origin <rama>:main` (avance rápido). GitHub Pages publica `main`.
- Mensajes de commit en español: «Módulo: qué cambia».

## Apps hermanas (mismo origen en GitHub Pages)
Charta (fichas, ver `js/charta.js` para el contrato de URL), Barri, Lectori, Calculi, Fori.
Comparten el proyecto de Firebase; las reglas de todas están en `firestore.rules`.
