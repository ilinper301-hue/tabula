// Tabula · Anecdotario · hoja de registro rápido.
//
// Objetivo: anotar una observación en ~3 segundos con la tableta en clase.
//   1) Toca a uno o varios alumnos (o «Todo el grupo»).
//   2) Elige el tipo (+ / − / ·) y toca una etiqueta: se guarda al instante y la hoja sigue abierta.
// El texto libre (con dictado por voz si el navegador lo permite) es opcional.
import { store } from '../../store.js';
import { h, icon, openSheet, toast } from '../../ui.js';
import { getGroup, getStudents, initials, areaShort, areaColor, fullName } from '../../school.js';
import { OBS_TYPES, addObservation, getTags, setTags, topTags } from '../../observations.js';
import { plural, shortName, TYPE_ORDER, micIcon } from './common.js';

const VISIBLE_TAGS = 8; // etiquetas visibles antes de «Más»
const hhmm = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

/**
 * Abre la hoja de registro rápido.
 * @param {{groupId:string, studentIds?:string[], area?:string|null, sesionId?:string|null}} opts
 * @returns {Function|null} close()
 */
export function openQuickObservation({ groupId, studentIds = [], area = null, sesionId = null } = {}) {
  const group = getGroup(groupId);
  if (!group) { toast('No se encuentra ese grupo'); return null; }
  const students = getStudents(groupId);
  const validIds = new Set(students.map((s) => s.id));

  const state = {
    tipo: 'positiva',
    selected: new Set((studentIds || []).filter((id) => validIds.has(id))),
    addingTag: false,
    showAllTags: false,
  };
  // Orden de etiquetas fijado al abrir (por uso) para que los botones no «salten» entre toques.
  const tagOrder = {};
  const tagsFor = (tipo) => {
    if (!tagOrder[tipo]) tagOrder[tipo] = topTags(tipo, 50);
    return tagOrder[tipo];
  };

  // ---------- Contexto ----------
  const clock = h('span', { class: 'ao-ctx-time' }, `Ahora · ${hhmm()}`);
  const context = h('div', { class: 'ao-context' },
    h('strong', { class: 'ao-ctx-group' }, group.nombre),
    area ? h('span', { class: `chip ${areaColor(area)}` }, areaShort(area)) : null,
    h('span', { class: 'ao-ctx-spacer' }),
    icon('clock', 14), clock);
  const clockTimer = setInterval(() => { clock.textContent = `Ahora · ${hhmm()}`; }, 20_000);

  // ---------- Alumnado ----------
  const selCount = h('span', { class: 'ao-count', 'aria-live': 'polite' });
  const allBtn = h('button', { type: 'button', class: 'ao-link', onclick: () => {
    const all = state.selected.size === students.length;
    state.selected = new Set(all ? [] : students.map((s) => s.id));
    paintSelection();
  } });
  const clearBtn = h('button', { type: 'button', class: 'ao-link', onclick: () => { state.selected.clear(); paintSelection(); } }, 'Quitar');

  const pupilBtns = new Map();
  const grid = h('div', { class: 'ao-pupils', role: 'group', 'aria-label': 'Alumnado' },
    students.map((s) => {
      const b = h('button', {
        type: 'button', class: 'ao-pupil', 'aria-pressed': 'false', 'aria-label': fullName(s),
        onclick: () => {
          if (state.selected.has(s.id)) state.selected.delete(s.id); else state.selected.add(s.id);
          paintSelection();
        },
      },
      h('span', { class: 'ao-avatar', 'aria-hidden': 'true' }, initials(s)),
      h('span', { class: 'ao-pupil-name' }, shortName(s, students)),
      h('span', { class: 'ao-pupil-check', 'aria-hidden': 'true' }, icon('check', 12)));
      pupilBtns.set(s.id, b);
      return b;
    }));

  const pupilsHead = h('div', { class: 'ao-pupils-head' },
    h('h3', { class: 'section-label' }, '¿A quién?'), selCount, h('span', { class: 'ao-ctx-spacer' }), clearBtn, allBtn);

  const scroller = h('div', { class: 'ao-scroll' },
    students.length ? grid
      : h('div', { class: 'empty' }, icon('grupos', 36), h('strong', {}, 'Este grupo aún no tiene alumnado'),
        'Añade a tu alumnado en Grupos para poder observarlo.'));

  // ---------- Qué: tipo + etiquetas ----------
  const typeBtns = TYPE_ORDER.map((t) => h('button', {
    type: 'button', class: `ao-type ao-t-${t}`, 'aria-pressed': String(t === state.tipo), dataset: { t },
    onclick: () => { state.tipo = t; state.addingTag = false; state.showAllTags = false; paintTypes(); paintTags(); },
  }, h('span', { class: 'ao-type-sign', 'aria-hidden': 'true' }, OBS_TYPES[t].sign), h('span', {}, OBS_TYPES[t].label)));
  const types = h('div', { class: 'ao-types', role: 'group', 'aria-label': 'Tipo de observación' }, typeBtns);
  const tagsBox = h('div', { class: 'ao-tags' });

  // ---------- Texto + dictado ----------
  const texto = h('textarea', {
    class: 'ao-text', rows: 1, maxlength: 600, placeholder: 'Nota con tus palabras…', 'aria-label': 'Texto de la observación',
    enterkeyhint: 'done',
  });
  const autosize = () => {
    texto.style.height = 'auto';
    const sh = texto.scrollHeight;
    texto.style.height = sh > 0 ? `${Math.min(sh, 112)}px` : '';
  };
  texto.addEventListener('input', () => { autosize(); paintSave(); });

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null;
  let listening = false;
  const micBtn = SR ? h('button', {
    type: 'button', class: 'ao-mic', 'aria-pressed': 'false', 'aria-label': 'Dictar',
    title: 'Dictar con la voz (el navegador puede enviar el audio a su servicio de reconocimiento)',
    onclick: () => toggleDictation(),
  }, micIcon(20)) : null;

  // Aviso de privacidad la primera vez: el reconocimiento de voz del navegador puede procesar el audio fuera del dispositivo
  let micNotice = null;
  function toggleDictation() {
    if (!listening && !store.getSetting('dictadoAviso', false)) {
      if (micNotice) return;
      micNotice = h('div', { class: 'confirm-box ao-mic-notice', role: 'note' },
        h('p', {}, 'El dictado usa el reconocimiento de voz del navegador, que puede enviar el audio a los servidores de Google o Apple. Evita decir nombres y apellidos o datos de salud: describe lo ocurrido.'),
        h('div', { class: 'settings-actions' },
          h('button', { type: 'button', class: 'btn btn-primary', onclick: () => { store.setSetting('dictadoAviso', true); micNotice.remove(); micNotice = null; toggleDictation(); } }, 'Entendido, dictar'),
          h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => { micNotice.remove(); micNotice = null; } }, 'Cancelar')));
      textRow.after(micNotice);
      return;
    }
    if (listening && rec) { rec.stop(); return; }
    let base = texto.value.trim();
    try {
      rec = new SR();
      rec.lang = 'es-ES';
      rec.interimResults = true;
      rec.continuous = false;
      rec.onresult = (e) => {
        const said = Array.from(e.results).map((r) => r[0].transcript).join('').trim();
        texto.value = [base, said].filter(Boolean).join(' ').slice(0, 600);
        autosize(); paintSave();
      };
      rec.onerror = (e) => {
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') toast('No hay permiso para usar el micrófono');
        else if (e.error === 'network') toast('El dictado necesita conexión a internet');
        else if (e.error !== 'no-speech' && e.error !== 'aborted') toast('No se pudo dictar. Inténtalo de nuevo');
      };
      rec.onend = () => { listening = false; micBtn.setAttribute('aria-pressed', 'false'); micBtn.classList.remove('is-on'); micBtn.setAttribute('aria-label', 'Dictar'); };
      rec.start();
      listening = true;
      micBtn.setAttribute('aria-pressed', 'true'); micBtn.classList.add('is-on'); micBtn.setAttribute('aria-label', 'Parar dictado');
    } catch { listening = false; toast('No se pudo iniciar el dictado'); }
  }

  const saveBtn = h('button', { type: 'button', class: 'btn btn-primary ao-save', onclick: () => saveTextOnly() }, 'Guardar');
  const textRow = h('div', { class: 'ao-textrow' }, texto, micBtn, saveBtn);

  // ---------- Pie ----------
  const hint = h('span', { class: 'ao-hint' });
  const doneBtn = h('button', { type: 'button', class: 'btn ao-done', onclick: () => close() }, icon('check', 16), 'Hecho');
  const foot = h('div', { class: 'ao-foot' }, hint, doneBtn);

  const dock = h('div', { class: 'ao-dock' }, types, tagsBox, textRow, foot);
  const root = h('div', { class: 'ao-quick' }, context, pupilsHead, scroller, dock);

  // ---------- Pintado ----------
  function paintSelection() {
    for (const [id, b] of pupilBtns) b.setAttribute('aria-pressed', String(state.selected.has(id)));
    const n = state.selected.size;
    selCount.textContent = n ? plural(n, 'elegido', 'elegidos') : '';
    allBtn.textContent = n === students.length && n > 0 ? 'Quitar a todos' : 'Todo el grupo';
    allBtn.hidden = !students.length;
    clearBtn.hidden = !n || n === students.length;
    hint.textContent = !students.length ? '' : n ? 'Toca una etiqueta para guardar' : 'Elige a quién observar';
    paintSave();
  }
  function paintTypes() {
    typeBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.t === state.tipo)));
  }
  function paintSave() {
    saveBtn.disabled = !texto.value.trim() || !state.selected.size;
  }
  function paintTags() {
    const tipo = state.tipo;
    const all = tagsFor(tipo);
    const list = state.showAllTags ? all : all.slice(0, VISIBLE_TAGS);
    const nodes = list.map((name) => h('button', {
      type: 'button', class: `ao-tag ao-t-${tipo}`, onclick: () => applyTag(name),
    }, name));
    if (!state.showAllTags && all.length > VISIBLE_TAGS) {
      nodes.push(h('button', { type: 'button', class: 'ao-tag ao-tag-more', onclick: () => { state.showAllTags = true; paintTags(); } }, `Más (${all.length - VISIBLE_TAGS})`));
    }
    if (state.addingTag) {
      const input = h('input', {
        class: 'ao-tag-input', type: 'text', maxlength: 40, placeholder: 'Nueva etiqueta', 'aria-label': 'Nueva etiqueta', autocomplete: 'off',
        onkeydown: (e) => {
          if (e.key === 'Enter') { e.preventDefault(); addCustom(input.value); }
          else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); state.addingTag = false; paintTags(); }
        },
      });
      nodes.push(h('span', { class: 'ao-tag-new' }, input,
        h('button', { type: 'button', class: 'ao-tag-ok', 'aria-label': 'Añadir etiqueta', onclick: () => addCustom(input.value) }, icon('check', 18)),
        h('button', { type: 'button', class: 'ao-tag-cancel', 'aria-label': 'Cancelar', onclick: () => { state.addingTag = false; paintTags(); } }, icon('x', 18))));
      tagsBox.replaceChildren(...nodes);
      setTimeout(() => input.focus(), 0);
      return;
    }
    nodes.push(h('button', { type: 'button', class: 'ao-tag ao-tag-add', onclick: () => { state.addingTag = true; paintTags(); } }, icon('plus', 14), 'Etiqueta'));
    tagsBox.replaceChildren(...nodes);
  }

  // ---------- Guardado ----------
  /** Avisa de que falta elegir alumnado (sin bloquear la hoja). */
  function nudge() {
    scroller.scrollTo?.({ top: 0 });
    grid.classList.remove('ao-nudge'); void grid.offsetWidth; grid.classList.add('ao-nudge');
    toast('Elige primero a quién');
  }

  /** Crea una observación por alumno seleccionado, avisa con «Deshacer» y deja la hoja lista para la siguiente. */
  function save({ etiqueta, text }) {
    const picked = students.filter((s) => state.selected.has(s.id));
    if (!picked.length) { nudge(); return false; }
    const created = [];
    try {
      for (const s of picked) created.push(addObservation({ studentId: s.id, groupId, tipo: state.tipo, etiqueta, texto: text, area, sesionId }));
    } catch {
      created.forEach((o) => store.remove('observaciones', o.id));
      toast('No se pudo guardar la observación');
      return false;
    }
    try { navigator.vibrate && navigator.vibrate(12); } catch { /* sin vibración */ }
    const who = picked.length === 1 ? shortName(picked[0], students) : plural(picked.length, 'alumno', 'alumnos');
    toast(`Observación guardada · ${who}`, {
      label: 'Deshacer', run: () => created.forEach((o) => store.remove('observaciones', o.id)),
    });
    state.selected.clear();
    paintSelection();
    return true;
  }

  function applyTag(name) {
    // Si hay texto escrito, acompaña a la etiqueta en vez de perderse.
    if (save({ etiqueta: name, text: texto.value })) { texto.value = ''; autosize(); paintSave(); }
  }

  function saveTextOnly() {
    const text = texto.value.trim();
    if (!text) { toast('Escribe o dicta una nota primero'); return; }
    if (save({ etiqueta: null, text })) {
      if (listening && rec) rec.stop();
      texto.value = ''; autosize(); paintSave();
    }
  }

  function addCustom(raw) {
    const name = (raw || '').trim().replace(/\s+/g, ' ');
    if (!name) { state.addingTag = false; paintTags(); return; }
    const tipo = state.tipo;
    const tags = getTags();
    const existing = tags[tipo].find((t) => t.toLowerCase() === name.toLowerCase());
    if (!existing) {
      setTags({ ...tags, [tipo]: [...tags[tipo], name] });
      tagsFor(tipo).push(name);
    }
    state.addingTag = false;
    state.showAllTags = true;
    paintTags();
    // Con alumnado elegido, la etiqueta nueva se usa en el momento.
    if (state.selected.size) applyTag(existing || name);
  }

  // ---------- Hoja y avisos junto al pie ----------
  // El aviso («toast») se coloca encima del bloque inferior para no tapar los botones.
  let ro = null;
  let sheetEl = null;
  const placeToast = () => {
    if (!sheetEl || !dock.isConnected) return;
    const top = dock.getBoundingClientRect().top;
    const overlay = sheetEl.parentElement;
    const style = document.body.style;
    style.setProperty('--ao-toast-bottom', `${Math.max(12, Math.round(window.innerHeight - top + 10))}px`);
    style.setProperty('--ao-toast-x', `${Math.round((overlay ? overlay.clientWidth : window.innerWidth) - sheetEl.offsetWidth / 2)}px`);
  };

  const close = openSheet('Observar', root, {
    onClose: () => {
      clearInterval(clockTimer);
      if (listening && rec) { try { rec.abort(); } catch { /* ya parado */ } }
      ro && ro.disconnect();
      window.removeEventListener('resize', placeToast);
      document.body.classList.remove('ao-open');
      document.body.style.removeProperty('--ao-toast-bottom');
      document.body.style.removeProperty('--ao-toast-x');
    },
  });
  sheetEl = root.closest('.sheet');
  if (sheetEl) sheetEl.classList.add('ao-sheet');
  document.body.classList.add('ao-open');
  if (typeof ResizeObserver !== 'undefined') { ro = new ResizeObserver(placeToast); ro.observe(dock); }
  window.addEventListener('resize', placeToast);
  setTimeout(placeToast, 260); // tras la animación de entrada

  paintSelection(); paintTypes(); paintTags(); autosize();
  return close;
}
