// Tabula · Asistente de primer uso («Asistente de primer uso»)
//   #/bienvenida
// Cuatro pasos (perfil, grupo, alumnado, horario) y una pantalla final. El progreso se guarda en el ajuste
// `onboarding` ({step, done, skipped, groupId, sessionIds}) para poder retomarlo tras recargar.
// Estilos: css/bienvenida.css (la pantalla se superpone a la navegación: es a pantalla completa).

import { store } from '../store.js';
import { h, icon } from '../ui.js';
import { TOTAL_STEPS, FINAL_STEP, loadState, saveState, clearDrafts } from './bienvenida/common.js';
import { stepPerfil } from './bienvenida/step-perfil.js';
import { stepGrupo } from './bienvenida/step-grupo.js';
import { stepAlumnado } from './bienvenida/step-alumnado.js';
import { stepHorario } from './bienvenida/step-horario.js';
import { finalScreen } from './bienvenida/final.js';

const STEPS = { 1: stepPerfil, 2: stepGrupo, 3: stepAlumnado, 4: stepHorario, [FINAL_STEP]: finalScreen };

/**
 * ¿Hay que llevar a esta persona al asistente? Solo si no lo ha terminado ni saltado y la app está vacía
 * (sin grupos, horario ni tareas). Lo que creó el propio asistente no cuenta, para poder retomarlo.
 * Quien ya tiene datos nunca es redirigida.
 */
export function needsOnboarding() {
  const ob = store.getSetting('onboarding', null) || {};
  if (ob.done || ob.skipped) return false;
  const ownSessions = new Set(Array.isArray(ob.sessionIds) ? ob.sessionIds : []);
  return !store.list('groups').some((g) => g.id !== ob.groupId)
    && !store.list('schedule').some((s) => !ownSessions.has(s.id))
    && !store.list('tasks').length;
}

export function render(container) {
  const st = loadState();
  // Si ya lo había terminado o saltado y vuelve aquí a propósito, empieza de nuevo (salvo la pantalla final).
  if ((st.done || st.skipped) && st.step !== FINAL_STEP) { st.step = 1; st.done = false; }
  st.skipped = false;

  document.documentElement.classList.add('bv-lock');
  const root = h('div', { class: 'bv-root' });
  container.replaceChildren(root);

  const hasGroup = () => !!(st.groupId && store.get('groups', st.groupId));

  const goTo = (n) => {
    st.step = n;
    if (n === FINAL_STEP) { st.done = true; clearDrafts(); }   // al llegar al final ya no se vuelve a ofrecer
    saveState(st);
    paint();
  };
  const toToday = () => { st.done = true; saveState(st); clearDrafts(); location.hash = '#/hoy'; };
  const skipAll = () => { st.skipped = true; saveState(st); clearDrafts(); location.hash = '#/hoy'; };

  function paint() {
    // Sin grupo no tienen sentido los pasos de alumnado y horario
    if ((st.step === 3 || st.step === 4) && !hasGroup()) st.step = 2;
    const n = st.step;
    const isFinal = n === FINAL_STEP;
    const ctx = { st, next, back, skip };
    const step = STEPS[n](ctx);

    function next() {
      if (step.next && step.next() === false) return;
      saveState(st);                               // guarda lo que haya añadido el paso (p. ej. groupId)
      goTo(n + 1);
    }
    function back() { goTo(n - 1); }
    function skip() { goTo(n === 2 && !hasGroup() ? FINAL_STEP : n + 1); }

    const title = h('h1', { class: 'bv-title', tabindex: '-1' }, step.title);
    const progress = h('div', {
      class: 'bv-progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(TOTAL_STEPS),
      'aria-valuenow': String(isFinal ? TOTAL_STEPS : n - 1), 'aria-label': 'Progreso del asistente',
    }, Array.from({ length: TOTAL_STEPS }, (_, i) => h('span', {
      class: `bv-seg${isFinal || i < n - 1 ? ' is-done' : ''}${!isFinal && i === n - 1 ? ' is-current' : ''}`,
    })));

    const foot = isFinal
      ? h('div', { class: 'bv-foot-in' },
        h('button', { type: 'button', class: 'btn btn-primary bv-go', onclick: toToday }, 'Ir a Hoy', icon('chevronRight', 18)))
      : h('div', { class: 'bv-foot-in' },
        n > 1 ? h('button', { type: 'button', class: 'btn btn-ghost bv-back', onclick: back }, icon('chevronLeft', 18), 'Atrás') : h('span'),
        step.skipLabel ? h('button', { type: 'button', class: 'link-btn bv-skip', onclick: skip }, step.skipLabel) : null,
        h('button', { type: 'button', class: 'btn btn-primary bv-next', onclick: next }, step.nextLabel || 'Siguiente', icon('chevronRight', 18)));

    const main = h('main', { class: 'bv-main' },
      h('div', { class: `bv-step${step.wide ? ' is-wide' : ''}` }, title, h('p', { class: 'bv-lead' }, step.lead), step.el));

    root.replaceChildren(
      h('header', { class: 'bv-top' },
        h('div', { class: 'bv-brand' }, h('span', { class: 'brand-mark' }, icon('logo', 18)), h('span', { class: 'brand-name' }, 'Tabula')),
        h('span', { class: 'bv-stepno', 'aria-live': 'polite' }, isFinal ? '¡Listo!' : `Paso ${n} de ${TOTAL_STEPS}`),
        isFinal ? h('span') : h('button', { type: 'button', class: 'link-btn bv-skipall', onclick: skipAll }, 'Saltar asistente')),
      progress, main, h('footer', { class: 'bv-foot' }, foot));
    main.scrollTop = 0;
    title.focus({ preventScroll: true });
  }

  paint();
  return () => { document.documentElement.classList.remove('bv-lock'); root.remove(); };
}
