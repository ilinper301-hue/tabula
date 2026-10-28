// Tabula · Planificación · «Programación»: hoja «Planificar» para un hueco vacío del horario.
// Crea una sesión en una situación del grupo y área (o coloca una sesión sin fecha) con fecha, franja y fija:true.
import { store } from '../../store.js';
import { h, icon, openSheet, toast, fromISO, DIAS, MESES } from '../../ui.js';
import { areaShort, areaColor, getGroup } from '../../school.js';
import {
  situacionesOf, sesionesOfSit, addSession, fixSessionDate, currentEvaluacion, field, ESTADOS_SIT,
} from './model.js';

/** Situación por defecto: la más reciente en curso; si no hay, la última no terminada; si no, la última. */
export function defaultSituacion(sits) {
  const byRecent = [...sits].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0) || (a.createdAt || 0) - (b.createdAt || 0));
  return [...byRecent].reverse().find((s) => s.estado === 'en_curso')
    || [...byRecent].reverse().find((s) => s.estado !== 'terminada') || byRecent[byRecent.length - 1] || null;
}

export const longDay = (iso) => { const d = fromISO(iso); return `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`; };

/**
 * @param block bloque del horario { id, ids, inicio, fin, area, groupId }
 * @param fecha 'YYYY-MM-DD'
 */
export function openPlanSheet({ block, fecha, onDone }) {
  const { groupId, area } = block;
  const group = getGroup(groupId);
  let sits = situacionesOf(groupId, area);
  const first = defaultSituacion(sits);

  const sitSel = sits.length ? h('select', { class: 'select', 'aria-label': 'Situación de aprendizaje' },
    sits.map((s) => h('option', { value: s.id, selected: first && s.id === first.id }, `${s.titulo}${s.estado && s.estado !== 'en_curso' ? ` · ${ESTADOS_SIT[s.estado] || ''}` : ''}`))) : null;
  const newSit = sits.length ? null : h('input', { class: 'input', type: 'text', maxlength: 140, placeholder: 'Por ejemplo: Los cuentos de la tradición oral' });
  const titulo = h('input', { class: 'input', type: 'text', maxlength: 140, 'aria-label': 'Título de la sesión' });
  const err = h('p', { class: 'pl-error', role: 'alert', hidden: true });
  const loose = h('div', { class: 'pr-loose' });

  const currentSit = () => (sitSel ? sits.find((s) => s.id === sitSel.value) : null);
  const nextOrden = (sit) => sesionesOfSit(sit.id).reduce((m, s) => Math.max(m, s.orden ?? 0), 0) + 1;
  const refresh = () => {
    const sit = currentSit();
    titulo.placeholder = sit ? `Sesión ${sesionesOfSit(sit.id).length + 1}` : 'Sesión 1';
    const free = sit ? sesionesOfSit(sit.id).filter((s) => !s.fecha && s.estado === 'pendiente') : [];
    loose.replaceChildren(...(free.length ? [
      h('p', { class: 'section-label' }, 'O coloca una sesión sin fecha'),
      h('ul', { class: 'pr-loose-list' }, free.slice(0, 8).map((s) => h('li', {},
        h('button', { type: 'button', class: 'pr-loose-btn', onclick: () => place(s) },
          h('span', {}, s.titulo || 'Sesión'), h('span', { class: 'pr-loose-go' }, 'Colocar'))))),
    ] : []));
  };

  const finish = (msg, undo) => { close(); toast(msg, undo ? { label: 'Deshacer', run: undo } : undefined); onDone && onDone(); };

  function place(ses) {
    const { undo } = fixSessionDate(ses.id, fecha, block.id);
    finish('Sesión colocada', undo);
  }

  function submit() {
    let sit = currentSit();
    let createdSit = null;
    if (!sit) {
      const t = newSit.value.trim();
      if (!t) { err.textContent = 'Escribe el título de la situación de aprendizaje.'; err.hidden = false; newSit.focus(); return; }
      sit = createdSit = store.add('situaciones', {
        groupId, area, titulo: t, evaluacion: currentEvaluacion(), descripcion: '', productoFinal: '',
        criterioIds: [], orden: 0, estado: 'en_curso',
      });
    }
    const title = titulo.value.trim() || `Sesión ${sesionesOfSit(sit.id).length + 1}`;
    const ses = addSession(sit, nextOrden(sit), title);
    store.update('sesiones', ses.id, { fecha, scheduleId: block.id, fija: true });
    finish('Sesión planificada', () => {
      store.remove('sesiones', ses.id);
      if (createdSit) store.remove('situaciones', createdSit.id);
    });
  }

  for (const el of [titulo, newSit].filter(Boolean)) el.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
  sitSel && sitSel.addEventListener('change', refresh);
  refresh();

  const close = openSheet('Planificar sesión', h('div', { class: 'pl-sheet pr-sheet' },
    h('div', { class: 'pr-sheet-when' },
      h('span', { class: `chip ${areaColor(area)}` }, areaShort(area)),
      h('div', {}, h('strong', {}, longDay(fecha)), h('span', { class: 'pl-sub' }, `${block.inicio}–${block.fin}${group ? ` · ${group.nombre}` : ''}`))),
    sitSel ? field('Situación de aprendizaje', sitSel) : field('Situación de aprendizaje (nueva)', newSit,
      `${group ? group.nombre + ' · ' : ''}${areaShort(area)} aún no tiene situaciones; se creará una.`),
    field('Título de la sesión', titulo, 'Opcional. Si lo dejas vacío se llamará «Sesión n».'),
    err,
    h('div', { class: 'pl-sheet-actions' },
      h('button', { type: 'button', class: 'btn btn-primary', onclick: submit }, icon('plus', 16), 'Planificar')),
    loose));
  return close;
}
