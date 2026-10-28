// Tabula · Bandeja del asistente: revisar, editar, aceptar o descartar los apuntes que envía el asistente.
// Se abre como hoja (openBandeja) desde Hoy y desde Ajustes; no tiene ruta propia.

import { store } from '../store.js';
import { h, icon, toast, openSheet, MESES, fromISO } from '../ui.js';
import { getGroups, getStudents, fullName } from '../school.js';
import { acceptItem, discardItem, pendingInbox, getAssistantState, onAssistantChange } from '../asistente.js';
import { TIPOS, matchStudents, readyToAccept } from '../asistente-model.js';

const TIPO_CHIP = { tarea: 't1', evento: 't3', observacion: 't5', reunion: 't6' };
const OBS = { positiva: 'Positiva', negativa: 'A mejorar', neutra: 'Neutra' };
const MODALIDAD = { presencial: 'Presencial', telefono: 'Telefónica', video: 'Videollamada' };
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const shortDate = (iso) => { if (!iso) return ''; const d = fromISO(iso); return `${d.getDate()} ${MESES[d.getMonth()].slice(0, 3)}`; };
const stamp = (ms) => { const d = new Date(ms); return `${d.getDate()} ${MESES[d.getMonth()].slice(0, 3)}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

let closeSheet = null;

// ---------- Datos del docente ----------
function groupsWithPupils() {
  return getGroups().map((g) => ({ id: g.id, nombre: g.nombre, alumnos: getStudents(g.id).map((s) => ({ id: s.id, nombre: s.nombre, apellidos: s.apellidos })) }));
}
function pupilInfo(id) {
  const s = store.get('students', id);
  if (!s) return null;
  const g = store.get('groups', s.groupId);
  return { id: s.id, nombre: s.nombre, apellidos: s.apellidos, groupId: s.groupId, grupo: g ? g.nombre : '', full: fullName(s) };
}

// ---------- Validación con los cambios del docente ----------
function required(tipo, d) {
  if (tipo === 'tarea') return !!(d.titulo || '').trim();
  if (tipo === 'evento') return !!(d.titulo || '').trim() && !!d.fecha;
  if (tipo === 'observacion') return !!(d.texto || '').trim() && !!d.fecha;
  if (tipo === 'reunion') return !!d.fecha;
  return true;
}
function groupsOfPupils(ids) { return [...new Set(ids.map((id) => pupilInfo(id)?.groupId).filter(Boolean))]; }
/** Dudas que quedan abiertas con los cambios actuales (las del alumnado se recalculan). */
function currentDudas(item, d) {
  const out = (item.dudas || []).filter((t) => !/alumno|grupos distintos/i.test(t));
  const hint = d.alumnoTexto ? ` («${d.alumnoTexto}»)` : '';
  if (item.tipo === 'observacion' && !d.studentId) out.push(`Falta elegir el alumno o alumna${hint}.`);
  if (item.tipo === 'reunion') {
    if (!d.studentIds.length) out.push(`Falta elegir el alumno o alumna${hint}.`);
    else if (groupsOfPupils(d.studentIds).length > 1) out.push('Los alumnos elegidos son de grupos distintos.');
  }
  return out;
}
const isReady = (item, d) => readyToAccept({ tipo: item.tipo, datos: d }) && required(item.tipo, d)
  && !(item.tipo === 'reunion' && groupsOfPupils(d.studentIds).length > 1);

/** Pasa los cambios a datos limpios para aceptar. */
function cleanDraft(item, draft) {
  if (!draft) return null;
  const out = { ...draft };
  for (const k of ['hora', 'horaFin']) if (k in out && !out[k]) out[k] = null;
  if ('fecha' in out && !out.fecha && item.tipo === 'tarea') out.fecha = null;
  for (const k of ['titulo', 'notas', 'texto', 'asistentes', 'motivo', 'resumen']) if (typeof out[k] === 'string') out[k] = out[k].trim();
  if (out.acuerdos) out.acuerdos = out.acuerdos.map((a) => a.trim()).filter(Boolean);
  return out;
}

// ---------- Hoja ----------
export function openBandeja() {
  if (closeSheet) return closeSheet;
  const drafts = new Map();     // id → cambios del docente
  const editing = new Set();    // ids en edición
  const queries = new Map();    // id → texto de búsqueda de alumnado
  let confirmAll = false;

  const root = h('div', { class: 'bj' });
  const draftOf = (item) => ({ ...item.datos, ...(drafts.get(item.id) || {}) });
  const setDraft = (item, patch) => { drafts.set(item.id, { ...(drafts.get(item.id) || {}), ...patch }); };

  async function accept(item) {
    const d = drafts.get(item.id);
    try {
      const undo = await acceptItem(item.id, cleanDraft(item, d));
      drafts.delete(item.id); editing.delete(item.id);
      if (undo) toast('Apunte aceptado', { label: 'Deshacer', run: undo });
    } catch (e) { toast(e.message || 'No se pudo aceptar'); }
  }
  function discard(item) {
    const undo = discardItem(item.id);
    drafts.delete(item.id); editing.delete(item.id);
    toast('Apunte descartado', { label: 'Deshacer', run: undo });
  }
  async function acceptAllReady() {
    const list = pendingInbox().filter((it) => isReady(it, draftOf(it)));
    const undos = [];
    for (const it of list) {
      try { const u = await acceptItem(it.id, cleanDraft(it, drafts.get(it.id))); if (u) undos.push(u); drafts.delete(it.id); editing.delete(it.id); }
      catch (e) { console.warn(e); }
    }
    confirmAll = false; paint();
    if (undos.length) toast(`${plural(undos.length, 'apunte aceptado', 'apuntes aceptados')}`, { label: 'Deshacer', run: () => undos.reverse().forEach((u) => u()) });
  }

  // ---- Selector de alumnado (resolver dudas o cambiar) ----
  function studentPicker(item, d, multi, onChange) {
    const ids = multi ? d.studentIds : (d.studentId ? [d.studentId] : []);
    const infos = ids.map(pupilInfo).filter(Boolean);
    const input = h('input', {
      class: 'input', type: 'text', autocomplete: 'off', placeholder: multi ? 'Añadir alumno o alumna…' : 'Buscar alumno o alumna…',
      'aria-label': multi ? 'Buscar alumnado para añadir' : 'Buscar alumno o alumna', value: queries.get(item.id) ?? d.alumnoTexto ?? '',
      disabled: multi ? infos.length >= 6 : false,
    });
    const list = h('ul', { class: 'bj-results', role: 'listbox', 'aria-label': 'Alumnado encontrado' });
    const set = (m) => {
      queries.delete(item.id);
      if (multi) {
        const next = [...new Set([...ids, m.id])].slice(0, 6);
        onChange({ studentIds: next, groupId: pupilInfo(next[0])?.groupId || null });
      } else onChange({ studentId: m.id, groupId: m.groupId });
    };
    const refresh = () => {
      queries.set(item.id, input.value);
      const taken = new Set(ids);
      const ms = matchStudents(groupsWithPupils(), input.value).filter((m) => !taken.has(m.id)).slice(0, 8);
      list.replaceChildren(...ms.map((m) => h('li', {}, h('button', { type: 'button', class: 'bj-result', role: 'option', dataset: { id: m.id }, onclick: () => set(m) },
        h('span', {}, [m.nombre, m.apellidos].filter(Boolean).join(' ')), h('span', { class: 'bj-result-g' }, m.grupo)))));
      if (input.value.trim() && !ms.length) list.replaceChildren(h('li', { class: 'bj-none' }, 'No hay nadie con ese nombre.'));
    };
    input.addEventListener('input', refresh);
    if (input.value.trim() && !infos.length) refresh();
    const chips = infos.map((p) => h('span', { class: 'bj-pchip' }, `${p.full} · ${p.grupo}`,
      h('button', { type: 'button', class: 'bj-pchip-x', 'aria-label': `Quitar a ${p.full}`, onclick: () => {
        if (multi) { const next = ids.filter((x) => x !== p.id); onChange({ studentIds: next, groupId: next.length ? pupilInfo(next[0])?.groupId || null : null }); }
        else onChange({ studentId: null, groupId: null });
      } }, icon('x', 13))));
    const needSearch = multi ? infos.length < 6 : !infos.length;
    return h('div', { class: 'bj-picker' }, chips.length ? h('div', { class: 'bj-pchips' }, chips) : null, needSearch ? input : null, needSearch ? list : null);
  }

  // ---- Contenido de un apunte ----
  const row = (label, value) => (value ? h('div', { class: 'bj-row' }, h('span', { class: 'bj-k' }, label), h('span', { class: 'bj-v' }, value)) : null);

  function viewBody(item, d, repaintCard) {
    const alumnoLine = (() => {
      if (item.tipo === 'observacion') { const p = d.studentId && pupilInfo(d.studentId); return p ? `${p.full} · ${p.grupo}` : null; }
      if (item.tipo === 'reunion') { const ps = d.studentIds.map(pupilInfo).filter(Boolean); return ps.length ? ps.map((p) => `${p.full} · ${p.grupo}`).join(' — ') : null; }
      return null;
    })();
    const parts = [];
    if (item.tipo === 'tarea') {
      parts.push(h('div', { class: 'bj-title' }, d.titulo),
        row('Fecha', [d.fecha ? shortDate(d.fecha) : '', d.hora].filter(Boolean).join(' · ') || null), row('Notas', d.notas));
    } else if (item.tipo === 'evento') {
      parts.push(h('div', { class: 'bj-title' }, d.titulo),
        row('Fecha', [shortDate(d.fecha), d.hora ? (d.horaFin ? `${d.hora}–${d.horaFin}` : d.hora) : ''].filter(Boolean).join(' · ')), row('Notas', d.notas));
    } else if (item.tipo === 'observacion') {
      parts.push(h('div', { class: 'bj-title' }, d.texto),
        row('Alumno/a', alumnoLine), row('Tipo', OBS[d.tipo] || 'Neutra'), row('Fecha', shortDate(d.fecha)));
    } else {
      parts.push(h('div', { class: 'bj-title' }, d.motivo || 'Tutoría'),
        row('Alumnado', alumnoLine),
        row('Fecha', [shortDate(d.fecha), d.hora, MODALIDAD[d.modalidad]].filter(Boolean).join(' · ')),
        row('Asistentes', d.asistentes), row('Resumen', d.resumen),
        d.acuerdos.length ? h('div', { class: 'bj-row' }, h('span', { class: 'bj-k' }, 'Acuerdos'), h('ul', { class: 'bj-ag' }, d.acuerdos.map((a) => h('li', {}, a)))) : null);
    }
    return parts;
  }

  function editBody(item, d, repaintCard, update) {
    const inp = (label, key, type = 'text', extra = {}) => {
      const id = `bj-${item.id}-${key}`;
      const el = h(type === 'area' ? 'textarea' : 'input', { class: type === 'area' ? 'textarea' : 'input', id, type: type === 'area' ? undefined : type, rows: type === 'area' ? '3' : undefined, ...extra });
      el.value = d[key] ?? '';
      el.addEventListener('input', () => { setDraft(item, { [key]: el.value }); update(); });
      return h('div', { class: 'field' }, h('label', { for: id }, label), el);
    };
    const two = (...f) => h('div', { class: 'bj-two' }, ...f);
    const pick = (multi) => h('div', { class: 'field' }, h('span', { class: 'field-label' }, multi ? 'Alumnado' : 'Alumno o alumna'),
      studentPicker(item, draftOf(item), multi, (patch) => { setDraft(item, patch); repaintCard(); }));
    if (item.tipo === 'tarea') return [inp('Título', 'titulo'), two(inp('Fecha', 'fecha', 'date'), inp('Hora', 'hora', 'time')), inp('Notas', 'notas', 'area')];
    if (item.tipo === 'evento') return [inp('Título', 'titulo'), inp('Fecha', 'fecha', 'date'), two(inp('Hora', 'hora', 'time'), inp('Hora de fin', 'horaFin', 'time')), inp('Notas', 'notas', 'area')];
    if (item.tipo === 'observacion') {
      const sel = h('select', { class: 'select', id: `bj-${item.id}-tipo`, onchange: (e) => { setDraft(item, { tipo: e.target.value }); update(); } },
        Object.entries(OBS).map(([v, l]) => h('option', { value: v, selected: v === d.tipo }, l)));
      return [pick(false), h('div', { class: 'field' }, h('label', { for: `bj-${item.id}-tipo` }, 'Tipo'), sel), inp('Observación', 'texto', 'area'), inp('Fecha', 'fecha', 'date')];
    }
    const mod = h('select', { class: 'select', id: `bj-${item.id}-mod`, onchange: (e) => { setDraft(item, { modalidad: e.target.value }); update(); } },
      Object.entries(MODALIDAD).map(([v, l]) => h('option', { value: v, selected: v === d.modalidad }, l)));
    const ag = h('textarea', { class: 'textarea', id: `bj-${item.id}-ag`, rows: '3', placeholder: 'Un acuerdo por línea' });
    ag.value = d.acuerdos.join('\n');
    ag.addEventListener('input', () => { setDraft(item, { acuerdos: ag.value.split('\n').slice(0, 20) }); update(); });
    return [pick(true), two(inp('Fecha', 'fecha', 'date'), inp('Hora', 'hora', 'time')),
      h('div', { class: 'field' }, h('label', { for: `bj-${item.id}-mod` }, 'Modalidad'), mod),
      inp('Asistentes', 'asistentes'), inp('Motivo', 'motivo', 'area'), inp('Resumen', 'resumen', 'area'),
      h('div', { class: 'field' }, h('label', { for: `bj-${item.id}-ag` }, 'Acuerdos'), ag)];
  }

  function card(item) {
    const needsPupil = item.tipo === 'observacion' || item.tipo === 'reunion';
    const holder = h('article', { class: 'bj-card', dataset: { id: item.id, tipo: item.tipo }, 'aria-label': `${TIPOS[item.tipo]}: ${item.origen === 'voz' ? 'dictado por ti' : 'apunte del asistente'}` });
    const repaintCard = () => { holder.replaceWith(card(item)); };
    const d = draftOf(item);
    const ready = isReady(item, d);
    const isEditing = editing.has(item.id);
    const dudas = currentDudas(item, d);

    const acceptBtn = h('button', {
      type: 'button', class: 'btn btn-primary btn-sm bj-accept', disabled: !ready,
      title: ready ? '' : 'Completa lo que falta para poder aceptarlo', onclick: () => accept(item),
    }, icon('check', 15), 'Aceptar');
    const update = () => {
      const r = isReady(item, draftOf(item));
      acceptBtn.disabled = !r;
    };
    const body = isEditing ? h('div', { class: 'bj-edit' }, editBody(item, d, repaintCard, update)) : h('div', { class: 'bj-body' }, viewBody(item, d, repaintCard));

    // Alumnado sin asignar: selector a la vista (sin tener que pulsar «Editar»)
    const resolver = !isEditing && needsPupil && dudas.some((t) => /alumno/i.test(t))
      ? h('div', { class: 'bj-resolve' }, h('span', { class: 'bj-k' }, item.tipo === 'reunion' ? 'Asignar alumnado' : 'Asignar alumno/a'),
        studentPicker(item, d, item.tipo === 'reunion', (patch) => { setDraft(item, patch); repaintCard(); }))
      : null;

    holder.append(...[
      h('div', { class: 'bj-head' },
        h('span', { class: `chip ${TIPO_CHIP[item.tipo]}` }, TIPOS[item.tipo]),
        h('span', { class: 'bj-by' }, `${item.origen === 'voz' ? 'Dictado por ti' : `Registrado por el asistente · ${item.dispositivo || 'Asistente'}`} · ${item.recibidoEn ? stamp(item.recibidoEn) : ''}`),
        // Tarea y evento comparten campos: si se entendió mal, se cambia con un toque
        item.tipo === 'tarea' || item.tipo === 'evento'
          ? h('button', { type: 'button', class: 'btn btn-sm btn-ghost bj-switch', onclick: () => {
            const tipo = item.tipo === 'tarea' ? 'evento' : 'tarea';
            const datos = { horaFin: null, ...draftOf(item) };
            drafts.delete(item.id);
            if (tipo === 'evento' && !datos.fecha) editing.add(item.id);   // un evento necesita fecha
            store.update('bandejaAsistente', item.id, { tipo, datos });
          } }, `Pasar a ${item.tipo === 'tarea' ? 'evento' : 'tarea'}`)
          : null),
      body,
      dudas.length ? h('ul', { class: 'bj-dudas', role: 'note' }, dudas.map((t) => h('li', {}, icon('clock', 14), t))) : null,
      resolver,
      h('div', { class: 'bj-actions' },
        acceptBtn,
        isEditing
          ? h('button', { type: 'button', class: 'btn btn-sm', onclick: () => { editing.delete(item.id); repaintCard(); } }, 'Listo')
          : h('button', { type: 'button', class: 'btn btn-sm', onclick: () => { editing.add(item.id); repaintCard(); } }, icon('edit', 15), 'Editar'),
        h('span', { class: 'bj-spacer' }),
        h('button', { type: 'button', class: 'btn btn-sm btn-ghost btn-danger', onclick: () => discard(item) }, icon('trash', 15), 'Descartar')),
    ].filter(Boolean));
    return holder;
  }

  function paint() {
    const items = pendingInbox();
    const ready = items.filter((it) => isReady(it, draftOf(it)));
    const parts = [h('p', { class: 'bj-lead' }, 'Lo que dictas o envía tu asistente espera aquí. No se guarda nada hasta que lo aceptes.')];
    if (!items.length) {
      parts.push(h('div', { class: 'empty' }, icon('note', 36), h('strong', {}, 'No hay apuntes pendientes'), 'Cuando tu asistente envíe algo, aparecerá aquí.'));
    } else {
      parts.push(h('div', { class: 'bj-bar' },
        h('span', { class: 'bj-count' }, plural(items.length, 'apunte pendiente', 'apuntes pendientes')),
        h('button', { type: 'button', class: 'btn btn-sm', id: 'bj-aceptar-todo', disabled: !ready.length, onclick: () => { confirmAll = true; paint(); } },
          ready.length ? `Aceptar todo lo listo (${ready.length})` : 'Aceptar todo lo listo')));
      if (confirmAll) {
        parts.push(h('div', { class: 'confirm-box', role: 'alertdialog', 'aria-label': 'Confirmar' },
          h('p', {}, `Se aceptarán ${plural(ready.length, 'apunte', 'apuntes')}${ready.length < items.length ? '. Los que tienen dudas se quedan en la bandeja' : ''}.`),
          h('div', { class: 'settings-actions' },
            h('button', { type: 'button', class: 'btn btn-primary', id: 'bj-confirmar-todo', onclick: acceptAllReady }, `Aceptar ${ready.length}`),
            h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => { confirmAll = false; paint(); } }, 'Cancelar'))));
      }
      parts.push(h('div', { class: 'bj-list' }, items.map(card)));
    }
    root.replaceChildren(...parts);
  }

  paint();
  const subs = ['bandejaAsistente', 'students', 'groups'].map((c) => store.subscribe(c, () => {
    // No repintar mientras se escribe dentro de un campo de la hoja
    if (root.contains(document.activeElement) && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName) && pendingInbox().length === root.querySelectorAll('.bj-card').length) return;
    paint();
  }));
  closeSheet = openSheet('Bandeja de revisión', root, {
    className: 'as-sheet',
    onClose: () => { subs.forEach((u) => u()); closeSheet = null; },
  });
  return closeSheet;
}

// ---------- Tarjeta de «Hoy» ----------
/** Monta en `slot` la tarjeta «Bandeja del asistente» (solo si hay algo que revisar). Devuelve limpieza. */
export function mountHoyCard(slot) {
  function paint() {
    const n = pendingInbox().length;
    const dev = getAssistantState().pendientes || 0;
    if (!n && !dev) { slot.replaceChildren(); return; }
    const rows = [];
    if (n) {
      rows.push(h('div', { class: 'hy-as-row' },
        h('div', { class: 'hy-as-text' },
          h('strong', {}, `Bandeja de revisión · ${plural(n, 'apunte', 'apuntes')}`),
          h('span', {}, 'Revisa lo dictado o enviado y decide qué se guarda.')),
        h('button', { type: 'button', class: 'btn btn-sm btn-primary', id: 'hoy-asistente-bandeja', onclick: () => openBandeja() }, 'Revisar')));
    }
    if (dev) {
      rows.push(h('div', { class: 'hy-as-row' },
        h('div', { class: 'hy-as-text' },
          h('strong', {}, dev === 1 ? 'Un dispositivo quiere usar tu acceso' : `${dev} dispositivos quieren usar tu acceso`),
          h('span', {}, 'Apruébalo en Ajustes si lo reconoces.')),
        h('button', { type: 'button', class: 'btn btn-sm', id: 'hoy-asistente-dispositivo', onclick: () => import('./ajustes/asistente.js').then((m) => m.goToAsistenteCard()) }, 'Revisar')));
    }
    slot.replaceChildren(h('section', { class: 'card hy-as', 'aria-label': 'Asistente' }, h('span', { class: 'hy-as-ico', 'aria-hidden': 'true' }, icon('download', 20)), h('div', { class: 'hy-as-rows' }, rows)));
  }
  paint();
  const u1 = onAssistantChange(paint);
  const u2 = store.subscribe('bandejaAsistente', paint);
  return () => { u1(); u2(); };
}
