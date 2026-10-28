# Tabula

Planificación, agenda y evaluación para docentes de Primaria.

## Módulos

- **Hoy**: horario del día con la sesión en curso, tareas, eventos.
- **Tareas**: escritura rápida en lenguaje natural, etiquetas, subtareas.
- **Calendario**: semana, mes y editor del horario; eventos y días no lectivos.
- **Grupos**: alumnado (pegar lista de Séneca), fichas, pasar lista, resumen de asistencia.
- **Cuaderno**: notas o niveles; cálculo por porcentajes o por criterios y competencias; rúbricas; exportar CSV.
- **Planificación**: situaciones de aprendizaje y sesiones repartidas automáticamente en el horario.
- **Planes y programas**: diario de coordinación, objetivos, equipo, tareas y memoria final.
- **Encuestas**: se comparten con un enlace (`encuesta.html`) y las respuestas llegan a la app.
- **Documentos**: biblioteca de fichas, PDF y enlaces, cola de impresión y fichas hechas con Claude.
- **Tutoría**: familias, reuniones con acuerdos y atención a la diversidad.
- **En clase**: temporizador, azar, equipos, responsables, semáforo y evaluación rápida.
- **Informes** (desde el Cuaderno): perfil competencial, resumen para Séneca e informes para familias.
- **Dictado por voz** (botón «Dictar» en Hoy): Tabula entiende tareas, eventos, observaciones y tutorías en el propio dispositivo y las deja en la bandeja de revisión.
- **Acceso de asistente**: enlace con llave propia y dispositivos aprobados; el asistente solo puede añadir apuntes a la bandeja y del alumnado solo ve iniciales.
- **Copia de seguridad** completa en .zip (datos y archivos), buscador y plan para el sustituto.
- **Sincronización** opcional con Firebase (cuentas de Google).

## Estructura

```
index.html            Página única de la app
manifest.webmanifest  App instalable (PWA)
sw.js                 Funcionamiento sin conexión
css/app.css           Sistema de diseño (colores, tipografía, componentes, modo oscuro)
css/tareas.css        Estilos del módulo de tareas
js/app.js             Arranque y navegación
js/store.js           Capa de datos (única puerta a los datos)
js/ui.js              Utilidades de interfaz, iconos y fechas
js/tasks-model.js     Lógica de tareas y escritura rápida en lenguaje natural
js/views/*.js         Una vista por pantalla (y su carpeta con las piezas)
js/voz-model.js       Interpretación del dictado por voz (sin DOM)
asistente.html        Página del asistente (apuntes hacia la bandeja)
encuesta.html         Página pública para responder encuestas
```

## Privacidad

Este repositorio contiene **solo código**. Los datos del alumnado nunca se suben aquí.

## Activar la sincronización (Firebase)

1. **Configuración**: ya está en `js/firebase-config.js` (proyecto `mis-apps-educativas`, compartido con Barri y Lectori).
2. **Acceso**: Authentication → Método de acceso → habilita **Google** (docentes) y **Anónimo** (para que los compañeros respondan encuestas sin cuenta).
3. **Dominio**: Authentication → Configuración → Dominios autorizados → añade `TU_USUARIO.github.io`.
4. **Reglas**: Firestore Database → Reglas → pega el contenido completo de `firestore.rules` (incluye Barri, Lectori y Tabula) y publica.
   ⚠️ Si tus reglas actuales tienen algo como `match /{document=**} { allow read, write: if true; }`, cualquiera podría leer los datos de Tabula: hay que cambiarlo antes de usarla con datos reales.
5. **Ubicación de los datos (RGPD)**: comprueba en Firestore → Configuración que la base de datos está en una región europea (p. ej. `eur3` o `europe-southwest1`).

Los datos se guardan en `apps/tabula/users/{uid}/…` y las encuestas compartidas en `apps/tabula/surveys/…`, separados de Barri y Lectori.

## Publicar

GitHub → Settings → Pages → *Deploy from a branch* → `main` / raíz.
