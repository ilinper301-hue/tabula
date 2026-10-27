// Tabula · Encuestas · pestaña «Resultados» (gráficos por pregunta, respuestas por persona, CSV)
import { h, icon, toast } from '../../ui.js';
import { summarize, toCSV, canPublish, surveyLink, deleteResponse } from '../../surveys.js';
import { eicon, copyText, downloadText, slug, plural, fmtWhen, fmtFull, fmtDateAnswer, friendlyError, inlineConfirm } from './common.js';

const pct = (n, total) => (total ? Math.round((n / total) * 100) : 0);
const fmtNum = (n) => String(n).replace('.', ',');

/** Barras horizontales (CSS) para opción única / múltiple / sí-no. */
function bars(sum) {
  const max = Math.max(1, ...sum.counts.map((c) => c.n));
  return h('ul', { class: 'enc-bars' }, ...sum.counts.map((c) => h('li', { class: 'enc-bar' },
    h('div', { class: 'enc-bar-top' }, h('span', { class: 'enc-bar-label' }, c.label), h('span', { class: 'enc-bar-val' }, `${c.n}`, h('small', {}, ` · ${pct(c.n, sum.total)} %`))),
    h('div', { class: 'enc-bar-track', 'aria-hidden': 'true' }, h('div', { class: `enc-bar-fill${c.n === max && c.n > 0 ? ' top' : ''}`, style: { width: `${pct(c.n, sum.total)}%` } })))));
}

/** Distribución de una escala en columnas + media. */
function scale(sum) {
  const q = sum.pregunta;
  const max = Math.max(1, ...sum.counts.map((c) => c.n));
  return h('div', { class: 'enc-scale' },
    h('div', { class: 'enc-media' }, h('strong', {}, sum.media === null ? '–' : fmtNum(sum.media)), h('span', {}, ` de ${q.escala?.max ?? 5} de media`)),
    h('div', { class: 'enc-cols', role: 'list' }, ...sum.counts.map((c) => h('div', { class: 'enc-col', role: 'listitem', 'aria-label': `${c.label}: ${plural(c.n, 'respuesta', 'respuestas')}` },
      h('span', { class: 'enc-col-n' }, String(c.n)),
      h('div', { class: 'enc-col-track', 'aria-hidden': 'true' }, h('div', { class: 'enc-col-fill', style: { height: `${(c.n / max) * 100}%` } })),
      h('span', { class: 'enc-col-l' }, c.label)))),
    q.escala?.etiquetaMin || q.escala?.etiquetaMax ? h('div', { class: 'ep-scale-labels enc-scale-labels' }, h('span', {}, q.escala.etiquetaMin || ''), h('span', {}, q.escala.etiquetaMax || '')) : null);
}

/** Lista desplazable de textos. */
function texts(sum, showName) {
  const fecha = sum.pregunta.tipo === 'fecha';
  return h('ul', { class: 'enc-texts', tabindex: '0', 'aria-label': 'Respuestas de texto' }, ...sum.textos.map((t) => h('li', {},
    h('span', {}, fecha ? fmtDateAnswer(t.texto) : t.texto), showName && t.nombre ? h('span', { class: 'enc-who' }, t.nombre) : null)));
}

export function createResultsPanel(ctx) {
  const el = h('div', { class: 'enc-res' });
  let mode = 'pregunta';
  let personId = null; // id local de la respuesta que se está viendo
  let busy = false;

  async function removeResponse(r) {
    if (busy) return;
    busy = true;
    try { await deleteResponse(ctx.id, r.id); toast('Respuesta eliminada'); }
    catch (e) { toast(friendlyError(e)); }
    busy = false; paint();
  }

  function person(s, rs) {
    if (!rs.length) return null;
    let i = rs.findIndex((r) => r.id === personId);
    if (i < 0) i = rs.length - 1; // por defecto, la más reciente
    const r = rs[i]; personId = r.id;
    const go = (d) => { personId = rs[i + d].id; paint(); };
    const { trigger, box } = inlineConfirm({ label: 'Eliminar esta respuesta', question: 'Se borrará solo esta respuesta, también de la nube. No se puede deshacer.', yes: 'Sí, eliminar', onYes: () => removeResponse(r) });
    const answerOf = (q) => {
      const v = r.answers?.[q.id];
      if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) return h('span', { class: 'enc-none' }, 'Sin respuesta');
      if (Array.isArray(v)) return h('ul', { class: 'enc-chips' }, ...v.map((x) => h('li', { class: 'chip t2' }, x)));
      if (q.tipo === 'fecha') return fmtDateAnswer(v);
      if (q.tipo === 'escala') return h('span', {}, h('strong', {}, String(v)), ` de ${q.escala?.min}–${q.escala?.max}`);
      return String(v);
    };
    return h('section', { class: 'card enc-person' },
      h('div', { class: 'enc-person-nav' },
        h('button', { type: 'button', class: 'icon-btn enc-nav', 'aria-label': 'Respuesta anterior', disabled: i === 0, onclick: () => go(-1) }, icon('chevronLeft')),
        h('div', { class: 'enc-person-title', 'aria-live': 'polite' },
          h('strong', {}, s.pedirNombre === 'no' ? 'Respuesta anónima' : (r.nombre || 'Sin nombre')),
          h('span', {}, `Respuesta ${i + 1} de ${rs.length} · ${fmtFull(r.enviadaAt)}`)),
        h('button', { type: 'button', class: 'icon-btn enc-nav', 'aria-label': 'Respuesta siguiente', disabled: i === rs.length - 1, onclick: () => go(1) }, icon('chevronRight'))),
      h('dl', { class: 'enc-qa' }, ...s.preguntas.flatMap((q, k) => [h('dt', {}, `${k + 1}. ${q.texto}`), h('dd', {}, answerOf(q))])),
      h('div', { class: 'enc-person-foot' }, trigger, box));
  }

  function byQuestion(s, rs) {
    return summarize(s, rs).map((sum, k) => {
      const q = sum.pregunta;
      let body;
      if (!sum.total) body = h('p', { class: 'enc-none' }, 'Nadie ha respondido a esta pregunta todavía.');
      else if (sum.counts && q.tipo !== 'escala') body = bars(sum);
      else if (q.tipo === 'escala') body = scale(sum);
      else body = texts(sum, s.pedirNombre !== 'no');
      return h('article', { class: 'card enc-rcard' },
        h('h3', { class: 'enc-rq' }, h('span', { class: 'ep-qn' }, `${k + 1}. `), q.texto),
        h('p', { class: 'enc-rmeta' }, `${plural(sum.total, 'respuesta', 'respuestas')}${q.tipo === 'multiple' && sum.total ? ' · se podían marcar varias' : ''}`),
        body);
    });
  }

  function paint() {
    const sc = scrollY;
    const s = ctx.survey(); const st = ctx.stored();
    if (!st) return;
    if (!st.publicId) {
      el.replaceChildren(h('div', { class: 'card enc-empty' }, eicon('poll', 40), h('strong', {}, 'Aún no hay resultados'),
        h('p', {}, 'Publica la encuesta y comparte el enlace; las respuestas aparecerán aquí al momento.'),
        h('button', { type: 'button', class: 'btn btn-primary', onclick: () => ctx.go('compartir') }, 'Ir a Compartir')));
      return;
    }
    const rs = ctx.responses();
    const live = canPublish();
    const link = surveyLink(st);
    const input = h('input', { class: 'input enc-link', readonly: true, value: link, 'aria-label': 'Enlace de la encuesta', onfocus: (e) => e.target.select() });
    const last = rs.at(-1);

    const head = h('div', { class: 'enc-res-head' },
      h('div', {}, h('div', { class: 'enc-count' }, h('strong', {}, String(rs.length)), ` ${rs.length === 1 ? 'respuesta' : 'respuestas'}`),
        last ? h('div', { class: 'enc-hint' }, `Última: ${fmtWhen(last.enviadaAt)}`) : null),
      live ? h('span', { class: 'enc-live' }, h('i', { 'aria-hidden': 'true' }), 'Se actualiza solo')
        : h('span', { class: 'enc-live off', title: 'Inicia sesión con Google para recibir respuestas' }, h('i', { 'aria-hidden': 'true' }), 'Sin conexión con la nube'));

    if (!rs.length) {
      el.replaceChildren(head, h('div', { class: 'card enc-empty' }, eicon('poll', 40), h('strong', {}, 'Todavía no hay respuestas'),
        h('p', {}, st.estado === 'abierta' ? 'Comparte este enlace con tus compañeros; cuando respondan, los resultados aparecerán aquí sin recargar.' : 'La encuesta está cerrada. Reábrela en la pestaña Compartir para recibir respuestas.'),
        input, h('div', { class: 'enc-actions' }, h('button', { type: 'button', class: 'btn btn-primary', onclick: async () => { if (await copyText(link, input)) toast('Enlace copiado'); } }, eicon('copy', 18), 'Copiar enlace'))));
      return;
    }

    const seg = h('div', { class: 'segmented', role: 'group', 'aria-label': 'Ver resultados' },
      ...[['pregunta', 'Por pregunta'], ['persona', 'Por persona']].map(([v, t]) => h('button', { type: 'button', 'aria-selected': String(mode === v), onclick: () => { mode = v; paint(); } }, t)));
    const csv = h('button', { type: 'button', class: 'btn', onclick: () => {
      downloadText(`encuesta-${slug(s.titulo).toLowerCase() || 'resultados'}.csv`, toCSV(s, rs));
    } }, icon('download', 18), 'Descargar CSV');
    el.replaceChildren(head, h('div', { class: 'enc-res-bar' }, seg, csv),
      mode === 'pregunta' ? h('div', { class: 'enc-rlist' }, ...byQuestion(s, rs)) : person(s, rs));
    scrollTo(0, sc);
  }
  paint();

  return {
    el,
    update(kind) { if (kind === 'responses' || kind === 'sync' || kind === 'survey') { if (!busy) paint(); } },
    destroy() {},
  };
}
