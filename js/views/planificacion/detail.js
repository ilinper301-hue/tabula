// Tabula · Planificación · detalle de una situación de aprendizaje
import { store } from '../../store.js';
import { h, icon, toast } from '../../ui.js';
import { hasSlots } from '../../planning.js';
import { competenciaOf } from '../../grading.js';
import {
  ESTADOS_SIT, ESTADO_SIT_CLASS, ESTADOS_SES, ESTADO_SES_CLASS, plural, whenText, href, ico, field, debounced,
  swapOrden, normalizeOrden, addSession, sesionesOfSit, sesionesOf, ctxFor, gradebookOf, replaceInOrder,
} from './model.js';
import { openSessionSheet } from './session-sheet.js';
import { openProgramSheet, openAddManySheet } from './sheets.js';

// Situaciones cuyo orden de sesiones ha cambiado y aún no se ha decidido si reprogramar
const reorderPending = new Set();

/** @param env { sit, groupId, area, schedule, go } */
export function renderDetail(env) {
  const { sit } = env;
  const own = sesionesOfSit(sit.id);
  const ctx = ctxFor(env.groupId, env.area);
  const slots = hasSlots(ctx);
  return [
    h('a', { class: 'pl-back', href: href({ grupo: env.groupId, area: env.area }) }, icon('chevronLeft', 16), 'Todas las situaciones'),
    headerCard(sit),
    criteriosCard(env, sit),
    sesionesCard(env, sit, own, slots),
    dangerZone(env, sit, own),
  ];
}

// ---------- Cabecera editable ----------
function headerCard(sit) {
  const save = (patch) => store.update('situaciones', sit.id, patch);
  // Texto con autoguardado; data-k permite conservar el foco al repintar
  const text = (key, tag, attrs, label, k) => {
    const el = h(tag, { ...attrs, value: sit[key] || '', 'data-k': k });
    const run = debounced(() => { if ((get(key) || '') !== el.value) save({ [key]: el.value }); }, 350);
    el.addEventListener('input', run);
    el.addEventListener('blur', () => run.flush());
    return label ? field(label, el) : el;
  };
  const get = (key) => (store.get('situaciones', sit.id) || {})[key];
  const titulo = text('titulo', 'input', { class: 'input pl-title-input', type: 'text', 'aria-label': 'Título de la situación', placeholder: 'Título de la situación' }, null, 'sit-titulo');
  const ev = h('select', { class: 'select', 'data-k': 'sit-ev', onchange: (e) => save({ evaluacion: Number(e.target.value) }) },
    [1, 2, 3].map((n) => h('option', { value: n, selected: (sit.evaluacion || 1) === n }, `${n}.ª evaluación`)));
  const estado = h('select', { class: 'select', 'data-k': 'sit-estado', onchange: (e) => save({ estado: e.target.value }) },
    Object.entries(ESTADOS_SIT).map(([v, l]) => h('option', { value: v, selected: sit.estado === v }, l)));
  return h('section', { class: 'card pl-head-card' },
    h('div', { class: 'pl-title-row' }, titulo),
    h('div', { class: 'pl-two' }, field('Evaluación', ev), field('Estado', estado)),
    text('descripcion', 'textarea', { class: 'textarea', rows: 3, placeholder: 'De qué trata y qué se quiere lograr' }, 'Descripción', 'sit-desc'),
    text('productoFinal', 'input', { class: 'input', type: 'text', placeholder: 'Por ejemplo: un libro de cuentos ilustrado' }, 'Producto final', 'sit-prod'));
}

// ---------- Criterios de evaluación ----------
function criteriosCard(env, sit) {
  const gb = gradebookOf(env.groupId, env.area);
  const crit = (gb && gb.criterios) || [];
  const chosen = new Set(sit.criterioIds || []);
  const valid = crit.filter((c) => chosen.has(c.id));
  const comps = [...new Set(valid.map((c) => competenciaOf(c.codigo)).filter(Boolean))].sort((a, b) => a - b);
  const toggle = (id, on) => {
    const next = new Set(store.get('situaciones', sit.id).criterioIds || []);
    on ? next.add(id) : next.delete(id);
    store.update('situaciones', sit.id, { criterioIds: [...next] });
  };
  return h('section', { class: 'card' },
    h('div', { class: 'card-head' },
      h('h2', { class: 'card-title' }, 'Criterios de evaluación'),
      h('span', { class: 'pl-hint' }, crit.length ? plural(valid.length, 'vinculado', 'vinculados') : '')),
    crit.length ? [
      comps.length ? h('div', { class: 'pl-comps', 'aria-label': 'Competencias específicas' },
        comps.map((n) => h('span', { class: `chip t${(Number(n) - 1) % 6 + 1}`, title: `Competencia específica ${n}` }, `CE${n}`))) : null,
      h('div', { class: 'pl-crit-list', role: 'group', 'aria-label': 'Criterios del cuaderno' },
        crit.map((c) => h('label', { class: 'pl-crit' },
          h('input', { type: 'checkbox', checked: chosen.has(c.id), 'data-k': `crit-${c.id}`, onchange: (e) => toggle(c.id, e.target.checked) }),
          h('span', { class: 'pl-crit-code' }, c.codigo),
          h('span', { class: 'pl-crit-desc' }, c.descripcion || '')))),
    ] : h('p', { class: 'pl-hint' },
      `El cuaderno de ${env.area} de este grupo aún no tiene criterios de evaluación. `,
      h('a', { href: `#/cuaderno?${new URLSearchParams({ grupo: env.groupId, area: env.area })}` }, 'Añádelos en el Cuaderno'),
      ' y podrás vincularlos aquí.'));
}

// ---------- Sesiones ----------
function sesionesCard(env, sit, own, slots) {
  const pendingCount = own.filter((s) => s.estado === 'pendiente' && !s.fija).length;
  const nextOrden = () => sesionesOfSit(sit.id).reduce((m, s) => Math.max(m, s.orden ?? 0), 0) + 1;

  // Alta rápida: Enter añade y deja el campo listo para la siguiente
  const quick = h('input', {
    class: 'input', type: 'text', placeholder: 'Título de la sesión y Enter', 'aria-label': 'Nueva sesión', 'data-k': 'quick', maxlength: 140,
    onkeydown: (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      add();
    },
  });
  const add = () => {
    const t = quick.value.trim();
    if (!t) return;
    quick.value = '';
    addSession(sit, nextOrden(), t);
    quick.focus();
  };

  const move = (s, dir) => {
    normalizeOrden('sesiones', sesionesOfSit(sit.id));
    const list = sesionesOfSit(sit.id);
    const i = list.findIndex((x) => x.id === s.id);
    const o = list[i + dir];
    if (!o) return;
    swapOrden('sesiones', list[i], o);
    if (list[i].estado === 'pendiente' && o.estado === 'pendiente' && !list[i].fija && !o.fija) reorderPending.add(sit.id);
  };

  const rows = own.map((s, i) => h('li', { class: `pl-ses is-${s.estado}` },
    h('span', { class: 'pl-ses-n', 'aria-hidden': 'true' }, String(i + 1)),
    h('button', { type: 'button', class: 'pl-ses-main', 'aria-label': `Abrir sesión ${i + 1}: ${s.titulo}`, onclick: () => openSessionSheet(s.id) },
      h('strong', {}, s.titulo || `Sesión ${i + 1}`),
      h('span', { class: `pl-sub${s.fecha ? '' : ' is-none'}` }, whenText(s, env.schedule))),
    h('span', { class: 'pl-ses-tags' },
      s.fija ? h('span', { class: 'pl-pin', title: 'Fecha fija' }, ico('pin', 16), h('span', { class: 'sr-only' }, 'Fecha fija')) : null,
      h('span', { class: `chip ${ESTADO_SES_CLASS[s.estado] || 't5'}` }, ESTADOS_SES[s.estado] || s.estado)),
    h('span', { class: 'pl-move' },
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Subir sesión ${i + 1}`, disabled: i === 0, onclick: () => move(s, -1) }, ico('up')),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Bajar sesión ${i + 1}`, disabled: i === own.length - 1, onclick: () => move(s, 1) }, ico('down')))));

  const banner = reorderPending.has(sit.id) && slots ? h('div', { class: 'pl-banner', role: 'status' },
    h('span', {}, 'Has cambiado el orden de las sesiones. ¿Las reprogramas en el nuevo orden?'),
    h('div', { class: 'pl-banner-actions' },
      h('button', {
        type: 'button', class: 'btn btn-sm btn-primary', onclick: () => {
          reorderPending.delete(sit.id);
          const { changes, undo } = replaceInOrder(sit.id);
          toast(changes.length ? `${plural(changes.length, 'sesión reprogramada', 'sesiones reprogramadas')}` : 'Las fechas ya seguían el orden', changes.length ? { label: 'Deshacer', run: undo } : undefined);
          if (!changes.length) env.repaint();
        },
      }, 'Reprogramar'),
      h('button', { type: 'button', class: 'btn btn-sm', onclick: () => { reorderPending.delete(sit.id); env.repaint(); } }, 'Mantener fechas'))) : null;

  return h('section', { class: 'card' },
    h('div', { class: 'card-head pl-ses-head' },
      h('h2', { class: 'card-title' }, 'Sesiones', own.length ? h('span', { class: 'pl-count' }, String(own.length)) : null),
      h('div', { class: 'pl-ses-actions' },
        h('button', { type: 'button', class: 'btn', onclick: () => openAddManySheet(sit) }, 'Añadir varias'),
        h('button', {
          type: 'button', class: 'btn btn-primary', disabled: !slots || !pendingCount,
          title: slots ? null : 'El grupo no tiene sesiones de esta área en el horario',
          onclick: () => openProgramSheet(sit),
        }, icon('calendario', 16), 'Programar en el horario'))),
    banner,
    own.length ? h('ol', { class: 'pl-ses-list' }, rows)
      : h('p', { class: 'pl-hint' }, 'Aún no hay sesiones. Escribe un título abajo y pulsa Enter, o usa «Añadir varias».'),
    h('div', { class: 'pl-quick' },
      h('div', { class: 'composer pl-composer' }, quick,
        h('button', { type: 'button', class: 'send', 'aria-label': 'Añadir sesión', onclick: add }, icon('plus', 18))),
      h('span', { class: 'pl-hint' }, '+ Sesión: Enter para añadir otra')));
}

// ---------- Eliminar ----------
function dangerZone(env, sit, own) {
  const box = h('div', { class: 'pl-confirm', role: 'alertdialog', 'aria-label': 'Confirmar eliminación', hidden: true },
    h('p', {}, own.length
      ? `Se eliminará la situación y sus ${plural(own.length, 'sesión', 'sesiones')}. Podrás deshacerlo unos segundos.`
      : 'Se eliminará la situación. Podrás deshacerlo unos segundos.'),
    h('div', { class: 'pl-confirm-actions' },
      h('button', { type: 'button', class: 'btn', onclick: () => { box.hidden = true; trigger.hidden = false; trigger.focus(); } }, 'No, conservar'),
      h('button', {
        type: 'button', class: 'btn btn-danger', onclick: () => {
          const sesiones = sesionesOfSit(sit.id);
          const fresh = store.get('situaciones', sit.id);
          sesiones.forEach((s) => store.remove('sesiones', s.id));
          store.remove('situaciones', sit.id);
          reorderPending.delete(sit.id);
          env.go({ sit: null });
          toast('Situación eliminada', {
            label: 'Deshacer', run: () => { store.restore('situaciones', fresh); sesiones.forEach((s) => store.restore('sesiones', s)); },
          });
        },
      }, icon('trash', 16), 'Sí, eliminar')));
  const trigger = h('button', {
    type: 'button', class: 'btn btn-ghost btn-danger', onclick: () => { trigger.hidden = true; box.hidden = false; box.querySelector('.btn').focus(); },
  }, icon('trash', 16), 'Eliminar situación');
  return h('div', { class: 'pl-danger' }, trigger, box);
}
