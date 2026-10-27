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
- **Sincronización** opcional con Firebase (cuentas de Google).
- Pendiente: Documentos y cola de impresión.

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
js/views/*.js         Una vista por pantalla
```

## Privacidad

Este repositorio contiene **solo código**. Los datos del alumnado nunca se suben aquí.

## Activar la sincronización (Firebase)

1. **Configuración**: Firebase console → ⚙ Configuración del proyecto → Tus apps → app web (créala si no existe) → copia el objeto `firebaseConfig` en `js/firebase-config.js`.
2. **Acceso**: Authentication → Método de acceso → habilita **Google** (docentes) y **Anónimo** (para que los compañeros respondan encuestas sin cuenta).
3. **Dominio**: Authentication → Configuración → Dominios autorizados → añade `TU_USUARIO.github.io`.
4. **Reglas**: Firestore Database → Reglas → añade el bloque de Tabula de `firestore.rules` **sin borrar** las reglas de las otras apps.
   ⚠️ Si tus reglas actuales tienen algo como `match /{document=**} { allow read, write: if true; }`, cualquiera podría leer los datos de Tabula: hay que cambiarlo antes de usarla con datos reales.
5. **Ubicación de los datos (RGPD)**: comprueba en Firestore → Configuración que la base de datos está en una región europea (p. ej. `eur3` o `europe-southwest1`).

Los datos se guardan en `apps/tabula/users/{uid}/…` y las encuestas compartidas en `apps/tabula/surveys/…`, separados de Barri y Lectori.

## Publicar

GitHub → Settings → Pages → *Deploy from a branch* → `main` / raíz.
