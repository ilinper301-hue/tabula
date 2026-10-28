// Tabula · guía rápida (ayudas por sección).
// Contrato: mountGuide(routeId, viewEl, params) — app.js la llama tras pintar cada vista.
// Ajuste 'guia': { activa: true, vistas: { [routeId]: true } } (vistas = secciones ya entendidas).
// Se coloca justo después de la primera .page-head (o al principio) y no se duplica al repintar.
import { store } from './store.js';
import { h, icon, toast } from './ui.js';

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
const saveGuide = (g) => store.setSetting(KEY, g);

let observer = null;
let current = null; // { routeId, viewEl }

function buildTip(routeId, tip) {
  const el = h('aside', { class: 'gd-tip', 'data-route': routeId, role: 'note', 'aria-label': 'Guía rápida' },
    h('span', { class: 'gd-ic', 'aria-hidden': 'true' }, icon('sparkle', 18)),
    h('div', { class: 'gd-main' },
      h('div', { class: 'gd-eyebrow' }, 'Guía rápida'),
      h('p', { class: 'gd-text' }, tip.text),
      h('ul', { class: 'gd-how', 'aria-label': 'Cómo…' },
        ...tip.how.map(([t, d]) => h('li', {}, h('strong', {}, `${t}: `), d))),
      h('div', { class: 'gd-actions' },
        h('button', { type: 'button', class: 'btn btn-sm gd-ok', onclick: () => {
          const g = loadGuide(); g.vistas = { ...g.vistas, [routeId]: true }; saveGuide(g); stop(); el.remove();
        } }, icon('check', 15), 'Entendido'),
        h('button', { type: 'button', class: 'link-btn gd-off', onclick: () => {
          const g = loadGuide(); saveGuide({ ...g, activa: false }); stop(); el.remove();
          toast('Guía desactivada. Puedes volver a activarla en Ajustes.', { label: 'Deshacer', run: () => saveGuide({ ...g, activa: true }) });
        } }, 'Desactivar la guía'))));
  return el;
}

function place(viewEl, tip) {
  const head = viewEl.querySelector('.page-head');
  if (head) head.after(tip); else viewEl.prepend(tip);
}

function stop() { if (observer) { observer.disconnect(); observer = null; } current = null; }

function currentRoute() { return (location.hash.replace(/^#\/?/, '').split('?')[0]) || 'hoy'; }

/** Pinta (si procede) la ayuda de la sección. Se puede llamar varias veces: nunca se duplica. */
export function mountGuide(routeId, viewEl) {
  stop();
  if (!viewEl) return;
  viewEl.querySelectorAll('.gd-tip').forEach((n) => n.remove());
  const tip = GUIDE_TIPS[routeId];
  const g = loadGuide();
  if (!tip || !g.activa || g.vistas[routeId]) return;
  place(viewEl, buildTip(routeId, tip));
  // Si la vista se repinta sin pasar por app.js, la ayuda vuelve a su sitio
  if (typeof MutationObserver === 'undefined') return;
  current = { routeId, viewEl };
  let queued = false;
  observer = new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      if (!current || current.viewEl.querySelector('.gd-tip')) return;
      const route = currentRoute();
      const now = loadGuide();
      if ((route || 'hoy') !== current.routeId || !now.activa || now.vistas[current.routeId]) return;
      place(current.viewEl, buildTip(current.routeId, GUIDE_TIPS[current.routeId]));
    });
  });
  observer.observe(viewEl, { childList: true, subtree: true });
}
