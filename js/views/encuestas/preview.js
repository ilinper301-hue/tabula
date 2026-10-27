// Tabula · Encuestas · vista previa (lo que verán los compañeros; no envía nada)
// Reproduce el marcado de js/encuesta-public.js con las mismas clases .ep-*.
import { h, toast } from '../../ui.js';
import { store } from '../../store.js';

export function renderPreview(s) {
  const profile = store.getSetting('profile', {}) || {};
  const autor = [profile.nombre, profile.centro].filter(Boolean).join(' · ');
  const pid = 'pv';

  const blocks = (s.preguntas || []).map((q, i) => {
    const qid = `${pid}-${q.id}`;
    const texto = q.texto?.trim() ? q.texto : h('span', { class: 'enc-pv-empty' }, 'Pregunta sin enunciado');
    const legend = [h('span', { class: 'ep-qn' }, `${i + 1}.`), ' ', texto, q.obligatoria ? h('span', { class: 'ep-req', 'aria-label': 'obligatoria' }, ' *') : null];
    const help = q.ayuda?.trim() ? h('p', { class: 'ep-help' }, q.ayuda) : null;
    let control;
    if (q.tipo === 'corta' || q.tipo === 'fecha') {
      control = h('div', { class: 'ep-field' }, h('label', { class: 'ep-q', for: qid }, ...legend), help,
        h('input', { class: 'input', id: qid, type: q.tipo === 'fecha' ? 'date' : 'text' }));
    } else if (q.tipo === 'larga') {
      control = h('div', { class: 'ep-field' }, h('label', { class: 'ep-q', for: qid }, ...legend), help,
        h('textarea', { class: 'textarea', id: qid, rows: '4' }));
    } else {
      const multiple = q.tipo === 'multiple';
      let options;
      if (q.tipo === 'sino') options = ['Sí', 'No'];
      else if (q.tipo === 'escala') {
        const { min = 1, max = 5 } = q.escala || {};
        options = []; for (let n = min; n <= max; n++) options.push(String(n));
      } else options = (q.opciones || []).map((o) => o.trim()).filter(Boolean);
      const items = options.map((o, k) => h('label', { class: `ep-opt${q.tipo === 'escala' ? ' ep-scale-opt' : ''}`, for: `${qid}-${k}` },
        h('input', { type: multiple ? 'checkbox' : 'radio', name: qid, id: `${qid}-${k}`, value: o }), h('span', {}, o)));
      const scaleLabels = q.tipo === 'escala' && (q.escala?.etiquetaMin || q.escala?.etiquetaMax)
        ? h('div', { class: 'ep-scale-labels', 'aria-hidden': 'true' }, h('span', {}, q.escala.etiquetaMin || ''), h('span', {}, q.escala.etiquetaMax || '')) : null;
      control = h('fieldset', { class: 'ep-field' }, h('legend', { class: 'ep-q' }, ...legend), help,
        h('div', { class: q.tipo === 'escala' ? 'ep-scale' : 'ep-opts' }, ...items), scaleLabels);
    }
    return h('div', { class: 'ep-card ep-question' }, control);
  });

  if (s.pedirNombre && s.pedirNombre !== 'no') {
    blocks.unshift(h('div', { class: 'ep-card ep-question' }, h('div', { class: 'ep-field' },
      h('label', { class: 'ep-q', for: `${pid}-nombre` }, 'Tu nombre',
        s.pedirNombre === 'obligatorio' ? h('span', { class: 'ep-req' }, ' *') : h('span', { class: 'ep-opt-tag' }, ' (opcional)')),
      h('input', { class: 'input', id: `${pid}-nombre`, autocomplete: 'off' }))));
  }

  const submit = h('button', { class: 'btn btn-primary ep-submit', type: 'button',
    onclick: () => toast('Es una vista previa: no se envía nada') }, 'Enviar respuesta');

  return h('div', { class: 'enc-pv' },
    h('header', { class: 'ep-card ep-head' },
      s.titulo?.trim() ? h('h2', { class: 'ep-title' }, s.titulo) : h('h2', { class: 'ep-title enc-pv-empty' }, 'Título de la encuesta'),
      s.descripcion?.trim() ? h('p', { class: 'ep-desc' }, s.descripcion) : null,
      h('p', { class: 'ep-meta' }, [autor ? `De ${autor}` : null, s.pedirNombre === 'no' ? 'Respuesta anónima' : null, 'Las preguntas con * son obligatorias'].filter(Boolean).join(' · '))),
    h('form', { class: 'ep-form', novalidate: true, onsubmit: (e) => e.preventDefault() }, ...blocks, h('div', { class: 'ep-actions' }, submit)));
}
