// Tabula · Encuestas · listado (#/encuestas)
import { h, icon, openSheet } from '../../ui.js';
import { store } from '../../store.js';
import { createSurvey, getResponses } from '../../surveys.js';
import { getPrograms } from '../../programs.js';
import { TEMPLATES } from './templates.js';
import { eicon, stateChip, programChip, fmtWhen, debounce } from './common.js';

const open = (id) => { location.hash = `#/encuestas?id=${encodeURIComponent(id)}&tab=editar`; };
function startFrom(tpl) {
  const s = createSurvey(tpl ? tpl.build() : {});
  open(s.id);
}

/** Hoja «Nueva encuesta»: en blanco o desde una plantilla. */
function newSurveySheet() {
  let close;
  const item = (title, desc, tpl) => h('button', { type: 'button', class: 'enc-tpl', onclick: () => { close(); startFrom(tpl); } },
    h('strong', {}, title), h('span', {}, desc));
  const body = h('div', { class: 'enc-tpl-list' },
    item('En blanco', 'Empieza con una pregunta y construye la encuesta a tu manera.', null),
    h('p', { class: 'section-label' }, 'Plantillas'),
    ...TEMPLATES.map((t) => item(t.nombre, t.desc, t)));
  close = openSheet('Nueva encuesta', body);
}

function card(s, programs) {
  const rs = getResponses(s.id);
  const last = rs.at(-1);
  const prog = s.programaId ? programs.find((p) => p.id === s.programaId) : null;
  const meta = last ? `Última respuesta: ${fmtWhen(last.enviadaAt)}`
    : s.publicId ? (s.estado === 'cerrada' ? 'Cerrada, sin respuestas' : 'Esperando respuestas') : 'Aún sin publicar';
  return h('a', { class: 'card enc-card', href: `#/encuestas?id=${encodeURIComponent(s.id)}` },
    h('div', { class: 'enc-card-main' },
      h('h2', { class: 'enc-card-title' }, s.titulo?.trim() || 'Encuesta sin título'),
      h('div', { class: 'enc-card-chips' }, stateChip(s), programChip(prog)),
      h('p', { class: 'enc-card-meta' }, meta)),
    s.publicId ? h('div', { class: 'enc-card-count', 'aria-label': `${rs.length} respuestas` }, h('strong', {}, String(rs.length)), h('span', {}, rs.length === 1 ? 'respuesta' : 'respuestas')) : null,
    icon('chevronRight', 18, 'enc-card-go'));
}

function welcome() {
  const step = (n, t, d) => h('li', {}, h('span', { class: 'enc-step-n', 'aria-hidden': 'true' }, String(n)), h('div', {}, h('strong', {}, t), h('p', {}, d)));
  return h('section', { class: 'card enc-welcome' },
    h('div', { class: 'enc-welcome-icon' }, eicon('poll', 28)),
    h('h2', { class: 'enc-h2' }, 'Pregunta a tus compañeros sin complicaciones'),
    h('ol', { class: 'enc-steps' },
      step(1, 'Crea', 'Escribe las preguntas o parte de una plantilla.'),
      step(2, 'Comparte el enlace', 'Por WhatsApp o correo. Responden sin cuenta.'),
      step(3, 'Recibe las respuestas aquí', 'Los resultados se actualizan solos.')),
    h('h3', { class: 'section-label' }, 'Empieza con una plantilla'),
    h('div', { class: 'enc-tpl-grid' }, ...TEMPLATES.map((t) => h('button', { type: 'button', class: 'enc-tpl', onclick: () => startFrom(t) }, h('strong', {}, t.nombre), h('span', {}, t.desc)))),
    h('button', { type: 'button', class: 'link-btn enc-blank', onclick: () => startFrom(null) }, 'o empezar en blanco'));
}

export function renderList(container) {
  const paint = () => {
    const programs = getPrograms({ includeArchived: true });
    const items = store.list('encuestas').sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    container.replaceChildren(
      h('header', { class: 'page-head' },
        h('div', {}, h('div', { class: 'eyebrow' }, 'Preguntas para el claustro'), h('h1', { class: 'page-title' }, 'Encuestas')),
        h('button', { type: 'button', class: 'btn btn-primary enc-new', onclick: newSurveySheet }, icon('plus', 18), 'Nueva encuesta')),
      items.length ? h('div', { class: 'enc-cards' }, ...items.map((s) => card(s, programs))) : welcome());
  };
  const repaint = debounce(paint, 60);
  paint();
  const unsubs = ['encuestas', 'encuestaRespuestas', 'programas'].map((c) => store.subscribe(c, repaint));
  return () => { repaint.cancel(); unsubs.forEach((u) => u()); };
}
