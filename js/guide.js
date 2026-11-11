// Tabula · guía rápida (ayudas por sección).
// Contrato: mountGuide(routeId, viewEl, params) — app.js la llama tras pintar cada vista.
// Ajuste 'guia': { activa: true } (el antiguo campo «vistas» ya no se usa).
// Ya no es una tarjeta: es un enlace discreto «¿Cómo funciona?» en la cabecera (pageHead) o, si la
// cabecera ya tiene acciones, una entrada del menú «⋯». Abre la ayuda en una hoja (openGuide).
// No se duplica al repintar: la cabecera queda marcada con data-guide.
import { store } from './store.js';
import { h, icon, openSheet } from './ui.js';
import { addHeadMenuItems, removeHeadMenuItems, headHasMenu, helpPlacement } from './ui-kit.js';

export const GUIDE_TIPS = {
  hoy: {
    text: 'Aquí ves tu día de un vistazo: el horario, las tareas y lo que tienes que imprimir.',
    how: [
      ['Añadir una tarea', 'escríbela arriba; si pones «mañana» o «el viernes», se programa sola.'],
      ['Pasar lista', 'pulsa «Pasar lista» en la clase en curso.'],
      ['Faltar un día', 'usa «Plan para el sustituto» bajo el horario.'],
    ],
  },
  tareas: {
    text: 'Todo lo pendiente en un solo sitio, ordenado por fecha.',
    how: [
      ['Crear una tarea', 'escribe en la caja de arriba; entiende fechas como «el lunes».'],
      ['Completarla', 'toca el círculo; tienes unos segundos para deshacer.'],
      ['Verlas por fechas', 'cambia entre Hoy, Próximas y Todas.'],
    ],
  },
  calendario: {
    text: 'Tu semana, tu mes y tu horario semanal, con los eventos del curso.',
    how: [
      ['Crear un evento', 'toca un día y elige «Añadir evento».'],
      ['Montar tu horario', 'abre la pestaña Horario y rellena cada casilla.'],
      ['Faltar un día', 'toca el día y pulsa «Plan para el sustituto».'],
    ],
  },
  aula: {
    text: 'Herramientas para usar en clase, pensadas para la pizarra o la tableta.',
    how: [
      ['Elegir a alguien al azar', 'usa la herramienta de azar o los equipos.'],
      ['Repartir responsabilidades', 'en «Responsables» se rotan cada semana.'],
      ['Evaluar sobre la marcha', 'toca «Evaluar» en la clase en curso desde Hoy.'],
    ],
  },
  grupos: {
    text: 'Tus grupos y su alumnado: la base de todo lo demás.',
    how: [
      ['Crear un grupo', 'pulsa «+» y añade el alumnado pegando la lista.'],
      ['Pasar lista', 'abre el grupo y entra en Asistencia.'],
      ['Anotar algo de un alumno', 'ábrelo y escribe en Observaciones.'],
    ],
  },
  tutoria: {
    text: 'Seguimiento de familias, reuniones y atención a la diversidad de tu tutoría.',
    how: [
      ['Programar una reunión', 'en Reuniones, elige alumnado, fecha y motivo.'],
      ['Cerrarla', 'anota el resumen y los acuerdos; los pendientes te los recordamos.'],
      ['Ver quién no ha venido', 'Familias muestra a quién aún no has visto.'],
    ],
  },
  cuaderno: {
    text: 'El cuaderno del profesor: actividades, notas y criterios de evaluación por área.',
    how: [
      ['Empezar', 'elige grupo y área; se cargan los criterios oficiales.'],
      ['Poner notas', 'crea una actividad y rellena la columna del alumnado.'],
      ['Informes', 'desde la pestaña de informes preparas boletines y Séneca.'],
    ],
  },
  planificacion: {
    text: 'Situaciones de aprendizaje divididas en sesiones que se reparten solas por tu horario.',
    how: [
      ['Crear una situación', 'elige grupo y área y pulsa «Nueva situación».'],
      ['Programarla', 'usa «Programar en el horario» para colocar las sesiones.'],
      ['Si falta una clase', 'marca la sesión como no realizada y se reajusta el resto.'],
      ['Ver la semana', 'la pestaña «Programación» muestra el horario con cada sesión, por semana o por mes.'],
    ],
  },
  documentos: {
    text: 'Tus fichas, PDF y enlaces, listos para abrir o imprimir.',
    how: [
      ['Subir un archivo', 'arrástralo o usa «Subir»; también puedes pegar fichas de Claude.'],
      ['Imprimir mañana', 'añade el documento a la cola y elige copias y fecha.'],
      ['Adjuntar a una sesión', 'desde la sesión en Planificación.'],
    ],
  },
  programas: {
    text: 'Tus planes y programas del centro, con diario, objetivos y memoria.',
    how: [
      ['Apuntar lo que haces', 'añade una entrada al Diario; Hoy te la ofrece en las horas de coordinación.'],
      ['Seguir objetivos', 'define objetivos y tareas del programa.'],
      ['Cerrar el curso', 'la pestaña Memoria reúne todo lo anotado.'],
    ],
  },
  encuestas: {
    text: 'Crea encuestas sencillas y recoge respuestas con un enlace.',
    how: [
      ['Crear una encuesta', 'pulsa «Nueva» y añade las preguntas.'],
      ['Compartirla', 'copia el enlace y envíalo a las familias.'],
      ['Ver resultados', 'se actualizan solos según llegan las respuestas.'],
    ],
  },
  ajustes: {
    text: 'Tu perfil, el aspecto de la app, la seguridad y las copias de seguridad.',
    how: [
      ['Cambiar el color', 'en Apariencia, elige modo claro, oscuro y acento.'],
      ['Proteger la app', 'activa el bloqueo con PIN.'],
      ['No perder nada', 'descarga una copia de vez en cuando.'],
    ],
  },
  mas: {
    text: 'El resto de secciones, a un toque.',
    how: [
      ['Ir a una sección', 'toca su nombre en la lista.'],
      ['Volver rápido', 'usa la barra inferior para Hoy, Tareas, Calendario o Grupos.'],
    ],
  },
};

const KEY = 'guia';
export const loadGuide = () => {
  const g = store.getSetting(KEY, null);
  return { activa: g ? g.activa !== false : true, vistas: g && typeof g.vistas === 'object' && g.vistas ? g.vistas : {} };
};

export const HELP_LABEL = '¿Cómo funciona?';

/** Abre la ayuda de una sección en una hoja. */
export function openGuide(routeId) {
  const tip = GUIDE_TIPS[routeId];
  if (!tip) return null;
  return openSheet(HELP_LABEL, h('div', { class: 'gd-sheet' },
    h('p', { class: 'gd-text' }, tip.text),
    h('ul', { class: 'gd-how', 'aria-label': 'Cómo…' }, ...tip.how.map(([t, d]) => h('li', {}, h('strong', {}, `${t}: `), d))),
    h('p', { class: 'gd-foot' }, 'Puedes ocultar estas ayudas en Ajustes → Guía rápida.')), { className: 'gd-sheet-panel' });
}

let observer = null;
let current = null; // { routeId, viewEl }

const isHelp = (it) => it && it.guide === true;

function attach(routeId, viewEl) {
  const head = viewEl.querySelector('.page-head');
  if (!head || head.dataset.guide) return;
  const actions = head.querySelector('.ph-actions');
  if (!actions) return; // cabecera sin pageHead: no hay sitio para el enlace
  head.dataset.guide = routeId;
  const run = () => openGuide(routeId);
  if (helpPlacement({ hasMenu: headHasMenu(head), actions: actions.children.length }) === 'menu') {
    addHeadMenuItems(head, [{ icon: 'help', label: HELP_LABEL, run, guide: true }]);
  } else {
    actions.append(h('button', { type: 'button', class: 'link-btn ph-help', 'aria-haspopup': 'dialog', onclick: run }, icon('help', 16), HELP_LABEL));
  }
}

function detach(viewEl) {
  viewEl.querySelectorAll('.page-head[data-guide]').forEach((head) => {
    head.querySelectorAll('.ph-help').forEach((n) => n.remove());
    removeHeadMenuItems(head, isHelp);
    delete head.dataset.guide;
  });
}

function stop() { if (observer) { observer.disconnect(); observer = null; } }

function currentRoute() { return (location.hash.replace(/^#\/?/, '').split('?')[0]) || 'hoy'; }

/** Pone (si procede) el enlace «¿Cómo funciona?» en la cabecera de la sección. Nunca se duplica. */
export function mountGuide(routeId, viewEl) {
  stop();
  current = viewEl ? { routeId, viewEl } : null;
  if (!viewEl) return;
  detach(viewEl);
  if (!GUIDE_TIPS[routeId] || !loadGuide().activa) return;
  attach(routeId, viewEl);
  // Si la vista repinta su cabecera sin pasar por app.js, el enlace vuelve a su sitio
  if (typeof MutationObserver === 'undefined') return;
  let queued = false;
  const cur = current;
  observer = new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      if (current !== cur || currentRoute() !== cur.routeId || !loadGuide().activa) return;
      attach(cur.routeId, cur.viewEl);
    });
  });
  observer.observe(viewEl, { childList: true, subtree: true });
}

/** Vuelve a aplicar el ajuste en la pantalla actual (al activar o desactivar la guía en Ajustes). */
export function refreshGuide() {
  if (current) mountGuide(current.routeId, current.viewEl);
}
