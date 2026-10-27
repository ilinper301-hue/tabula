// Tabula · Encuestas · pestaña «Editar» (datos, preguntas, vista previa y barra de publicación)
import { h, icon, toast } from '../../ui.js';
import { store } from '../../store.js';
import { QUESTION_TYPES, NAME_MODES, newQuestion, validateSurvey, canPublish, NEED_CLOUD } from '../../surveys.js';
import { getPrograms } from '../../programs.js';
import { questionCard } from './question-card.js';
import { renderPreview } from './preview.js';
import { changeType, duplicateQuestion, publicSig, clone } from './model.js';
import { eicon, plural, debounce, friendlyError } from './common.js';

const TYPE_HINTS = {
  corta: 'Una línea de texto', larga: 'Un párrafo', unica: 'Elegir una opción', multiple: 'Marcar varias opciones',
  escala: 'Valorar en una escala', sino: 'Sí o No', fecha: 'Elegir una fecha',
};

export function createEditPanel(ctx) {
  const el = h('div', { class: 'enc-edit' });
  const list = h('div', { class: 'enc-questions' });
  const pvHost = h('div', { class: 'enc-pv-host' });
  const bar = h('div', { class: 'enc-publish-bar card' });
  const warn = h('div', { class: 'enc-warn-host' });
  const progSel = h('select', { class: 'select', id: 'enc-prog', onchange: (e) => { ctx.draft.programaId = e.target.value || null; changed(); } });
  let busy = false;
  let menuClose = null;

  // ---------- Cambios: guardar, refrescar vista previa y barra ----------
  const paintPreview = debounce(() => { if (!pvHost.isConnected && !el.isConnected) return; pvHost.replaceChildren(renderPreview(ctx.survey())); }, 120);
  function changed() {
    ctx.queueSave();
    ctx.paintHead();
    paintPreview();
    paintBar();
  }

  // ---------- Datos generales ----------
  const field = (label, control, hint) => h('div', { class: 'field' }, h('label', { for: control.id }, label), control, hint ? h('span', { class: 'enc-hint' }, hint) : null);
  function paintPrograms() {
    const cur = ctx.draft.programaId;
    const progs = getPrograms({ includeArchived: true }).filter((p) => !p.archivado || p.id === cur);
    progSel.replaceChildren(h('option', { value: '' }, 'Sin programa'), ...progs.map((p) => h('option', { value: p.id, selected: p.id === cur }, p.nombre)));
    progSel.value = cur && progs.some((p) => p.id === cur) ? cur : '';
  }
  function buildMeta() {
    const d = ctx.draft;
    const titulo = h('input', { class: 'input', id: 'enc-titulo', maxlength: '120', placeholder: 'Ej.: Valoración de la jornada de convivencia', value: d.titulo, oninput: (e) => { d.titulo = e.target.value; changed(); } });
    const desc = h('textarea', { class: 'textarea', id: 'enc-desc', rows: '3', maxlength: '1000', placeholder: 'Explica en una o dos frases para qué es la encuesta (opcional)', oninput: (e) => { d.descripcion = e.target.value; changed(); } });
    desc.value = d.descripcion || '';
    const nombre = h('select', { class: 'select', id: 'enc-nombre', onchange: (e) => { d.pedirNombre = e.target.value; changed(); } },
      ...Object.entries(NAME_MODES).map(([k, v]) => h('option', { value: k, selected: k === d.pedirNombre }, v)));
    const fin = h('input', { class: 'input', id: 'enc-fin', maxlength: '300', value: d.mensajeFinal, placeholder: '¡Gracias por responder!', oninput: (e) => { d.mensajeFinal = e.target.value; changed(); } });
    paintPrograms();
    return h('section', { class: 'card enc-meta', 'aria-label': 'Datos de la encuesta' },
      field('Título', titulo), field('Descripción', desc),
      h('div', { class: 'enc-two' },
        field('Nombre de quien responde', nombre, d.pedirNombre === 'no' ? 'No se sabrá quién ha respondido.' : null),
        field('Programa (opcional)', progSel)),
      field('Mensaje al terminar', fin));
  }

  // ---------- Preguntas ----------
  function paintQuestions(focus) {
    const qs = ctx.draft.preguntas;
    list.replaceChildren(...qs.map((q, i) => questionCard(q, i, qs.length, {
      change: changed,
      retype: (tipo) => { changeType(q, tipo); changed(); paintQuestions({ qid: q.id, f: 'tipo' }); },
      move: (d) => { const j = i + d; [qs[i], qs[j]] = [qs[j], qs[i]]; changed(); paintQuestions({ qid: q.id, f: d < 0 ? 'up' : 'down' }); },
      duplicate: () => {
        const copy = duplicateQuestion(q); qs.splice(i + 1, 0, copy); changed();
        paintQuestions({ qid: copy.id, f: 'texto', scroll: true }); toast('Pregunta duplicada');
      },
      remove: () => {
        const [gone] = qs.splice(i, 1); changed(); paintQuestions();
        toast('Pregunta eliminada', { label: 'Deshacer', run: () => { ctx.draft.preguntas.splice(Math.min(i, ctx.draft.preguntas.length), 0, gone); changed(); paintQuestions({ qid: gone.id, f: 'texto', scroll: true }); } });
      },
    })));
    if (!qs.length) list.append(h('div', { class: 'card enc-noq' }, h('p', {}, 'Todavía no hay preguntas. Añade la primera con el botón «Pregunta».')));
    if (focus) {
      const card = list.querySelector(`[data-qid="${focus.qid}"]`);
      let target = card?.querySelector(`[data-f="${focus.f}"]`);
      if (target?.disabled) target = card.querySelector('[data-f="texto"]');
      target?.focus({ preventScroll: !focus.scroll });
      if (focus.scroll) card?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }

  // ---------- Menú «+ Pregunta» ----------
  function buildAddMenu() {
    const btn = h('button', { type: 'button', class: 'btn enc-add-q', 'aria-haspopup': 'menu', 'aria-expanded': 'false' }, icon('plus', 18), 'Pregunta');
    const menu = h('div', { class: 'enc-menu', role: 'menu', hidden: true },
      ...Object.entries(QUESTION_TYPES).map(([k, v]) => h('button', { type: 'button', role: 'menuitem', class: 'enc-menu-item', onclick: () => {
        close();
        const q = newQuestion(k); ctx.draft.preguntas.push(q); changed(); paintQuestions({ qid: q.id, f: 'texto', scroll: true });
      } }, h('strong', {}, v.label), h('span', {}, TYPE_HINTS[k]))));
    const onDoc = (e) => { if (!menu.contains(e.target) && e.target !== btn && !btn.contains(e.target)) close(); };
    const onKey = (e) => { if (e.key === 'Escape') { close(); btn.focus(); } };
    function close() {
      menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); menuClose = null;
      document.removeEventListener('pointerdown', onDoc); document.removeEventListener('keydown', onKey);
    }
    btn.addEventListener('click', () => {
      if (!menu.hidden) return close();
      menu.hidden = false; btn.setAttribute('aria-expanded', 'true'); menuClose = close;
      // Se abre hacia arriba si hay sitio; si no, hacia abajo.
      const r = btn.getBoundingClientRect();
      menu.classList.toggle('down', r.top < 380 && innerHeight - r.bottom > r.top);
      document.addEventListener('pointerdown', onDoc); document.addEventListener('keydown', onKey);
      menu.querySelector('button').focus();
    });
    return h('div', { class: 'enc-add-wrap' }, btn, menu);
  }

  // ---------- Aviso con respuestas e información de publicación ----------
  function paintWarn() {
    const st = ctx.stored();
    const n = ctx.responses().length;
    warn.replaceChildren(...(st?.publicId && n > 0
      ? [h('div', { class: 'enc-banner', role: 'note' }, icon('flag', 18), h('span', {}, `Ya hay ${plural(n, 'respuesta', 'respuestas')}: si cambias o borras preguntas, sus respuestas pueden no cuadrar.`))] : []));
  }

  async function doUpdate(btn) {
    if (busy) return;
    busy = true; paintBar();
    try { await ctx.publish(); toast('Encuesta actualizada'); }
    catch (e) { toast(friendlyError(e)); }
    busy = false; paintBar();
  }
  function paintBar() {
    const s = ctx.survey(); const st = ctx.stored() || s;
    const errors = validateSurvey(s);
    const parts = [];
    if (errors.length) {
      parts.push(h('div', { class: 'enc-errors', role: 'status' }, h('strong', {}, 'Para poder publicar falta:'), h('ul', {}, ...errors.map((e) => h('li', {}, e)))));
    }
    if (!st.publicId) {
      parts.push(h('div', { class: 'enc-bar-row' },
        h('p', { class: 'enc-bar-text' }, errors.length ? 'Puedes seguir editando; se guarda solo.' : 'Todo listo. Publica la encuesta para obtener el enlace.'),
        h('button', { type: 'button', class: 'btn btn-primary', disabled: !!errors.length, onclick: () => ctx.go('compartir') }, eicon('send', 18), 'Publicar y obtener enlace')));
      if (!errors.length && !canPublish()) parts.push(h('p', { class: 'enc-note' }, NEED_CLOUD, ' ', h('a', { href: '#/ajustes' }, 'Ir a Ajustes')));
    } else {
      const dirty = st.publicadaSig !== publicSig(s);
      parts.push(h('div', { class: 'enc-bar-row' },
        h('p', { class: 'enc-bar-text' }, dirty ? 'Tienes cambios que tus compañeros aún no ven.' : 'Lo que ves aquí es lo que ven tus compañeros.'),
        dirty
          ? h('button', { type: 'button', class: 'btn btn-primary', disabled: !!errors.length || busy || !canPublish(), onclick: doUpdate }, busy ? 'Actualizando…' : 'Actualizar encuesta publicada')
          : h('button', { type: 'button', class: 'btn', onclick: () => ctx.go('compartir') }, eicon('link', 18), 'Ver enlace')));
      if (dirty && !canPublish()) parts.push(h('p', { class: 'enc-note' }, NEED_CLOUD, ' ', h('a', { href: '#/ajustes' }, 'Ir a Ajustes')));
    }
    bar.replaceChildren(...parts);
  }

  // ---------- Montaje ----------
  function build() {
    menuClose?.();
    const pvToggle = h('button', { type: 'button', class: 'btn enc-pv-toggle', 'aria-pressed': 'false', onclick: (e) => {
      const on = el.classList.toggle('show-pv');
      e.currentTarget.setAttribute('aria-pressed', String(on));
      e.currentTarget.replaceChildren(on ? icon('note', 18) : eicon('eye', 18), on ? 'Volver a editar' : 'Vista previa');
      if (on) window.scrollTo(0, 0);
    } }, eicon('eye', 18), 'Vista previa');
    const form = h('div', { class: 'enc-form-col' }, warn, buildMeta(),
      h('h2', { class: 'section-label enc-sec' }, 'Preguntas'), list,
      h('div', { class: 'enc-add-row' }, buildAddMenu(), pvToggle), bar);
    const pv = h('aside', { class: 'enc-pv-col', 'aria-label': 'Vista previa' },
      h('div', { class: 'enc-pv-note' }, eicon('eye', 16), 'Así lo verán tus compañeros'), pvHost);
    el.replaceChildren(form, pv);
    paintQuestions(); paintWarn(); paintBar();
    pvHost.replaceChildren(renderPreview(ctx.survey()));
  }
  build();

  return {
    el,
    /** kind: 'survey' | 'responses' | 'programs' | 'sync' | 'remote' (contenido cambiado desde otro dispositivo) */
    update(kind) {
      if (kind === 'remote') { const sc = scrollY; build(); scrollTo(0, sc); return; }
      if (kind === 'programs') { paintPrograms(); return; }
      paintWarn(); paintBar();
    },
    /** ¿Hay un campo de esta pestaña con el foco? (no repintar mientras se escribe) */
    hasFocus: () => el.contains(document.activeElement) && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName),
    destroy() { menuClose?.(); paintPreview.cancel(); },
  };
}
