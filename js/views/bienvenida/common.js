// Tabula · Asistente de primer uso · estado y utilidades comunes a los pasos
import { store } from '../../store.js';
import { h } from '../../ui.js';

export const TOTAL_STEPS = 4;      // pasos con decisiones
export const FINAL_STEP = 5;       // pantalla «Todo listo»

/**
 * Estado persistente (ajuste `onboarding`), por si se recarga a mitad:
 * step 1..5 · done · skipped · groupId (grupo creado por el asistente) · sessionIds (sesiones de horario creadas).
 */
export function loadState() {
  const raw = store.getSetting('onboarding', null) || {};
  const step = Number.isInteger(raw.step) ? Math.min(FINAL_STEP, Math.max(1, raw.step)) : 1;
  return {
    ...raw, step, done: !!raw.done, skipped: !!raw.skipped,
    groupId: typeof raw.groupId === 'string' ? raw.groupId : null,
    sessionIds: Array.isArray(raw.sessionIds) ? raw.sessionIds : [],
  };
}
export const saveState = (st) => store.setSetting('onboarding', { ...st });

// ---------- Borradores (solo esta pestaña): lo escrito y aún no confirmado sobrevive a una recarga ----------
const DRAFT_KEY = 'tabula:onboarding-draft';
const readDrafts = () => { try { return JSON.parse(sessionStorage.getItem(DRAFT_KEY)) || {}; } catch { return {}; } };
export const getDraft = (key, fallback) => { const d = readDrafts(); return d[key] === undefined ? fallback : d[key]; };
export function setDraft(key, value) {
  try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ ...readDrafts(), [key]: value })); } catch {}
}
export const clearDrafts = () => { try { sessionStorage.removeItem(DRAFT_KEY); } catch {} };

let fid = 0;
/** Campo con etiqueta asociada: field('Nombre', input, 'ayuda opcional'). */
export function field(label, control, hint) {
  const id = control.id || (control.id = `bv-f${++fid}`);
  return h('div', { class: 'bv-field' },
    h('label', { for: id }, label), control,
    hint ? h('span', { class: 'bv-hint' }, hint) : null);
}

/** Mensaje de error accesible (oculto hasta que se usa). */
export function errorBox() {
  const el = h('p', { class: 'bv-error', role: 'alert', hidden: true });
  el.show = (msg) => { el.textContent = msg; el.hidden = false; };
  el.clear = () => { el.hidden = true; };
  return el;
}
