// Tabula · Planes y programas · formulario rápido de anotación (diario) y hoja «Anotar»
import { h, icon, toast, openSheet, todayISO } from '../../ui.js';
import { store } from '../../store.js';
import { ENTRY_TYPES, addEntry, getPrograms, fmtDuration } from '../../programs.js';
import { cleanUrl } from './common.js';

const DURATIONS = [15, 30, 45, 60, 90];
let lastTipo = 'actuacion'; // el tipo elegido por última vez se recuerda mientras dure la sesión

/**
 * Formulario de anotación reutilizable (composer del Diario y hoja rápida).
 * opts: { programaId, programs (para mostrar selector), fecha, duracionMin, onSaved(entry), autofocus }
 * Devuelve { el, focus, setProgram }.
 */
export function entryForm(opts = {}) {
  let tipo = lastTipo;
  let dur = opts.duracionMin || null;
  let programaId = opts.programaId || null;

  const texto = h('textarea', {
    class: 'textarea pg-texto', rows: 3, id: `pg-t${Math.random().toString(36).slice(2, 7)}`,
    placeholder: '¿Qué has hecho hoy?', 'aria-label': '¿Qué has hecho hoy?',
  });
  const fecha = h('input', { class: 'input', type: 'date', value: opts.fecha || todayISO(), 'aria-label': 'Fecha' });
  const enlace = h('input', { class: 'input', type: 'url', placeholder: 'https://… (opcional)', 'aria-label': 'Enlace opcional', autocomplete: 'off' });
  const custom = h('input', {
    class: 'input pg-dur-custom', type: 'number', min: '1', max: '1440', inputmode: 'numeric',
    placeholder: 'Otro', 'aria-label': 'Duración en minutos (otra)',
    oninput: () => { dur = Number(custom.value) > 0 ? Math.round(Number(custom.value)) : null; paintDur(); },
  });
  const error = h('p', { class: 'pg-error', role: 'alert', hidden: true });

  // Selector de programa (solo cuando hace falta elegirlo)
  const programs = opts.programs || null;
  const progSel = programs
    ? h('select', { class: 'select', 'aria-label': 'Programa', onchange: () => { programaId = progSel.value || null; } },
      h('option', { value: '' }, '— Elige un programa —'),
      programs.map((p) => h('option', { value: p.id, selected: p.id === programaId }, p.nombre)))
    : null;

  // Chips de tipo
  const tipoBox = h('div', { class: 'pg-chips', role: 'radiogroup', 'aria-label': 'Tipo de anotación' },
    Object.entries(ENTRY_TYPES).map(([k, v]) => h('button', {
      type: 'button', role: 'radio', class: `pg-pick ${v.color}`, dataset: { k }, 'aria-checked': String(k === tipo),
      onclick: () => { tipo = k; lastTipo = k; paintTipo(); },
    }, v.label)));
  const paintTipo = () => tipoBox.querySelectorAll('.pg-pick').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.k === tipo)));

  // Chips de duración
  const durBox = h('div', { class: 'pg-chips', role: 'group', 'aria-label': 'Duración' },
    DURATIONS.map((m) => h('button', {
      type: 'button', class: 'pg-pick pg-pick-dur', dataset: { m }, 'aria-pressed': 'false',
      onclick: () => { dur = dur === m ? null : m; custom.value = ''; paintDur(); },
    }, `${m} min`)), custom);
  function paintDur() {
    durBox.querySelectorAll('.pg-pick-dur').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.m) === dur && !custom.value)));
    if (dur && !DURATIONS.includes(dur) && !custom.value) custom.value = String(dur);
  }
  paintDur();

  const submit = () => {
    const t = texto.value.trim();
    error.hidden = true;
    if (!programaId) { error.textContent = 'Elige a qué programa pertenece la anotación.'; error.hidden = false; progSel && progSel.focus(); return null; }
    if (!t) { error.textContent = 'Escribe qué has hecho.'; error.hidden = false; texto.focus(); return null; }
    const url = cleanUrl(enlace.value);
    if (url === null) { error.textContent = 'El enlace debe empezar por http:// o https://.'; error.hidden = false; enlace.focus(); return null; }
    if (!fecha.value) { error.textContent = 'Elige una fecha.'; error.hidden = false; fecha.focus(); return null; }
    const entry = addEntry(programaId, { fecha: fecha.value, tipo, texto: t, duracionMin: dur, enlace: url });
    // Se limpia lo que cambia de una anotación a otra; el tipo y la fecha se conservan
    texto.value = ''; enlace.value = ''; custom.value = ''; dur = null; paintDur();
    const p = store.get('programas', programaId);
    toast(`Anotado en ${p ? p.nombre : 'el programa'}`, { label: 'Deshacer', run: () => store.remove('diarioPrograma', entry.id) });
    opts.onSaved && opts.onSaved(entry);
    return entry;
  };
  texto.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(); }
  });

  const el = h('form', { class: 'pg-entry-form', novalidate: true, onsubmit: (e) => { e.preventDefault(); submit(); } },
    progSel ? h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Programa'), progSel) : null,
    texto, tipoBox,
    h('div', { class: 'pg-form-row' },
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Fecha'), fecha),
      h('div', { class: 'field pg-grow' }, h('span', { class: 'field-label' }, 'Enlace'), enlace)),
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Duración'), durBox),
    error,
    h('div', { class: 'pg-form-foot' },
      h('span', { class: 'pg-hint' }, 'Ctrl/⌘ + Intro para anotar'),
      h('button', { type: 'submit', class: 'btn btn-primary' }, icon('plus', 16), 'Anotar')));

  return {
    el,
    focus: () => texto.focus(),
    setProgram: (id) => { programaId = id; if (progSel) progSel.value = id || ''; },
  };
}

/**
 * Hoja para anotar rápido en el diario de un programa.
 * openQuickEntry({ programaId?, fecha?, duracionMin? }) — sin programaId se ofrece un selector.
 */
export function openQuickEntry({ programaId, fecha, duracionMin } = {}) {
  const programs = getPrograms();
  const known = programaId ? store.get('programas', programaId) : null;
  let close;

  if (!programs.length && !known) {
    close = openSheet('Anotar en el diario', h('div', { class: 'empty' }, icon('flag', 36),
      h('strong', {}, 'Aún no tienes planes ni programas'),
      'Crea el primero para empezar a anotar lo que haces cada día.',
      h('div', { style: { marginTop: '12px' } },
        h('a', { class: 'btn btn-primary', href: '#/programas', onclick: () => close() }, 'Ir a Planes y programas'))));
    return close;
  }

  const form = entryForm({
    programaId: known ? known.id : (programs.length === 1 ? programs[0].id : null),
    programs: known ? null : programs,
    fecha, duracionMin,
    onSaved: () => close(),
  });
  const title = known ? `Anotar · ${known.nombre}` : 'Anotar en el diario';
  const head = [];
  if (duracionMin) head.push(h('p', { class: 'pg-hint pg-sheet-note' }, `Sesión de ${fmtDuration(duracionMin)} precargada.`));
  close = openSheet(title, h('div', { class: 'pg-sheet' }, ...head, form.el));
  setTimeout(() => form.focus(), 120);
  return close;
}

