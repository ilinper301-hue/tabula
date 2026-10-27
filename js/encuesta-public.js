// Tabula · página pública para responder una encuesta (encuesta.html#<id>)
// No necesita cuenta: inicia una sesión anónima de Firebase. Cada navegador puede enviar
// una respuesta y modificarla mientras la encuesta siga abierta.

import { h } from './ui.js';
import { firebaseConfig, FIREBASE_SDK } from './firebase-config.js';

const root = document.getElementById('ep');
const id = decodeURIComponent(location.hash.replace(/^#/, '')).trim();

const show = (...nodes) => root.replaceChildren(...nodes);
const message = (title, text) => show(h('div', { class: 'ep-card ep-msg' }, h('h1', { class: 'ep-title' }, title), text ? h('p', {}, text) : null));

async function main() {
  if (!/^[A-Za-z0-9]{12,40}$/.test(id)) return message('Enlace no válido', 'Revisa que el enlace esté completo. Pídeselo de nuevo a quien te lo envió.');
  if (!firebaseConfig) return message('Encuesta no disponible', 'Esta instalación de Tabula todavía no tiene la nube configurada.');

  let fb;
  try {
    const base = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK}`;
    const [app, auth, fs] = await Promise.all([import(`${base}/firebase-app.js`), import(`${base}/firebase-auth.js`), import(`${base}/firebase-firestore.js`)]);
    fb = { app, auth, fs };
  } catch {
    return message('Sin conexión', 'No se ha podido cargar la encuesta. Comprueba la conexión y vuelve a intentarlo.');
  }
  const app = fb.app.initializeApp(firebaseConfig, 'tabula-encuesta');
  const auth = fb.auth.getAuth(app);
  const db = fb.fs.getFirestore(app);

  let user;
  try { user = (await fb.auth.signInAnonymously(auth)).user; } catch {
    return message('Encuesta no disponible', 'No se ha podido iniciar la encuesta. Inténtalo más tarde.');
  }

  const surveyRef = fb.fs.doc(db, 'apps', 'tabula', 'surveys', id);
  const myRef = fb.fs.doc(db, 'apps', 'tabula', 'surveys', id, 'responses', user.uid);
  let survey, mine = null;
  try {
    const snap = await fb.fs.getDoc(surveyRef);
    if (!snap.exists()) return message('Encuesta no encontrada', 'Puede que se haya borrado o que el enlace no sea correcto.');
    survey = snap.data();
  } catch {
    // Las reglas solo dejan leer encuestas abiertas
    return message('Encuesta cerrada', 'Esta encuesta ya no admite respuestas.');
  }
  if (survey.estado !== 'abierta') return message('Encuesta cerrada', 'Esta encuesta ya no admite respuestas.');
  try { const m = await fb.fs.getDoc(myRef); if (m.exists()) mine = m.data(); } catch {}

  document.title = `${survey.titulo} · Encuesta`;
  if (mine) {
    show(h('div', { class: 'ep-card ep-msg' },
      h('h1', { class: 'ep-title' }, 'Ya has respondido'),
      h('p', {}, 'Tu respuesta se ha recibido. Puedes cambiarla mientras la encuesta siga abierta.'),
      h('button', { class: 'btn btn-primary', onclick: () => renderForm(survey, mine, save) }, 'Modificar mi respuesta')));
  } else renderForm(survey, null, save);

  async function save(payload) {
    await fb.fs.setDoc(myRef, { ...payload, createdAt: fb.fs.serverTimestamp(), version: 2 });
  }
}

/** Formulario accesible: una pregunta por bloque, validación al enviar. */
function renderForm(s, prev, save) {
  const getters = [];
  const errorOf = new Map();
  let nameInput = null;

  const blocks = s.preguntas.map((q, i) => {
    const qid = `q-${q.id}`;
    const err = h('p', { class: 'ep-err', id: `${qid}-err`, role: 'alert', hidden: true });
    errorOf.set(q.id, err);
    const legend = [h('span', { class: 'ep-qn' }, `${i + 1}.`), ' ', q.texto, q.obligatoria ? h('span', { class: 'ep-req', 'aria-label': 'obligatoria' }, ' *') : null];
    const help = q.ayuda ? h('p', { class: 'ep-help', id: `${qid}-help` }, q.ayuda) : null;
    const pv = prev?.answers?.[q.id];
    let control, get;

    if (q.tipo === 'corta' || q.tipo === 'fecha') {
      const inp = h('input', { class: 'input', id: qid, type: q.tipo === 'fecha' ? 'date' : 'text', maxlength: '300', value: pv ?? '', 'aria-describedby': help ? `${qid}-help` : null });
      control = h('div', { class: 'ep-field' }, h('label', { class: 'ep-q', for: qid }, ...legend), help, inp);
      get = () => inp.value.trim();
    } else if (q.tipo === 'larga') {
      const ta = h('textarea', { class: 'textarea', id: qid, maxlength: '3000', rows: '4', 'aria-describedby': help ? `${qid}-help` : null });
      ta.value = pv ?? '';
      control = h('div', { class: 'ep-field' }, h('label', { class: 'ep-q', for: qid }, ...legend), help, ta);
      get = () => ta.value.trim();
    } else {
      const multiple = q.tipo === 'multiple';
      let options;
      if (q.tipo === 'sino') options = ['Sí', 'No'];
      else if (q.tipo === 'escala') {
        const { min = 1, max = 5 } = q.escala || {};
        options = []; for (let n = min; n <= max; n++) options.push(String(n));
      } else options = q.opciones;
      const inputs = options.map((o, k) => {
        const inp = h('input', { type: multiple ? 'checkbox' : 'radio', name: qid, id: `${qid}-${k}`, value: o,
          checked: multiple ? Array.isArray(pv) && pv.includes(o) : String(pv) === o });
        return { o, inp, el: h('label', { class: `ep-opt${q.tipo === 'escala' ? ' ep-scale-opt' : ''}`, for: `${qid}-${k}` }, inp, h('span', {}, o)) };
      });
      const group = h('div', { class: q.tipo === 'escala' ? 'ep-scale' : 'ep-opts' }, ...inputs.map((x) => x.el));
      const scaleLabels = q.tipo === 'escala' && (q.escala?.etiquetaMin || q.escala?.etiquetaMax)
        ? h('div', { class: 'ep-scale-labels', 'aria-hidden': 'true' }, h('span', {}, q.escala.etiquetaMin || ''), h('span', {}, q.escala.etiquetaMax || '')) : null;
      control = h('fieldset', { class: 'ep-field', 'aria-describedby': help ? `${qid}-help` : null },
        h('legend', { class: 'ep-q' }, ...legend), help, group, scaleLabels);
      get = () => {
        const sel = inputs.filter((x) => x.inp.checked).map((x) => x.o);
        if (multiple) return sel;
        if (!sel.length) return '';
        return q.tipo === 'escala' ? Number(sel[0]) : sel[0];
      };
    }
    getters.push({ q, get });
    return h('div', { class: 'ep-card ep-question' }, control, err);
  });

  if (s.pedirNombre && s.pedirNombre !== 'no') {
    nameInput = h('input', { class: 'input', id: 'ep-nombre', maxlength: '80', autocomplete: 'name', value: prev?.nombre || '' });
    blocks.unshift(h('div', { class: 'ep-card ep-question' },
      h('div', { class: 'ep-field' }, h('label', { class: 'ep-q', for: 'ep-nombre' }, 'Tu nombre', s.pedirNombre === 'obligatorio' ? h('span', { class: 'ep-req' }, ' *') : h('span', { class: 'ep-opt-tag' }, ' (opcional)')), nameInput),
      h('p', { class: 'ep-err', id: 'ep-nombre-err', role: 'alert', hidden: true })));
  }

  const status = h('p', { class: 'ep-status', role: 'status' });
  const submit = h('button', { class: 'btn btn-primary ep-submit', type: 'submit' }, prev ? 'Guardar cambios' : 'Enviar respuesta');

  const form = h('form', { class: 'ep-form', novalidate: true, onsubmit: async (e) => {
    e.preventDefault();
    let firstBad = null;
    const answers = {};
    for (const { q, get } of getters) {
      const v = get();
      const empty = v === '' || v === null || (Array.isArray(v) && !v.length);
      const err = errorOf.get(q.id);
      if (q.obligatoria && empty) { err.textContent = 'Esta pregunta es obligatoria.'; err.hidden = false; firstBad ||= err.parentElement; }
      else { err.hidden = true; if (!empty) answers[q.id] = v; }
    }
    let nombre = null;
    if (nameInput) {
      nombre = nameInput.value.trim() || null;
      const ne = document.getElementById('ep-nombre-err');
      if (s.pedirNombre === 'obligatorio' && !nombre) { ne.textContent = 'Escribe tu nombre.'; ne.hidden = false; firstBad ||= ne.parentElement; } else ne.hidden = true;
    }
    if (firstBad) { firstBad.scrollIntoView({ behavior: 'smooth', block: 'center' }); firstBad.querySelector('input, textarea')?.focus({ preventScroll: true }); return; }
    submit.disabled = true; status.textContent = 'Enviando…';
    try {
      await save({ answers, nombre });
      show(h('div', { class: 'ep-card ep-msg ep-done' },
        h('h1', { class: 'ep-title' }, 'Respuesta enviada'),
        h('p', {}, s.mensajeFinal || '¡Gracias por responder!')));
      window.scrollTo(0, 0);
    } catch {
      submit.disabled = false;
      status.textContent = 'No se ha podido enviar. Comprueba la conexión. Si la encuesta se ha cerrado, ya no admite respuestas.';
    }
  } }, ...blocks, h('div', { class: 'ep-actions' }, submit, status));

  show(
    h('header', { class: 'ep-card ep-head' },
      h('h1', { class: 'ep-title' }, s.titulo),
      s.descripcion ? h('p', { class: 'ep-desc' }, s.descripcion) : null,
      h('p', { class: 'ep-meta' }, [s.autor ? `De ${s.autor}` : null, s.pedirNombre === 'no' ? 'Respuesta anónima' : null, 'Las preguntas con * son obligatorias'].filter(Boolean).join(' · '))),
    form);
}

main().catch(() => message('Algo ha fallado', 'No se ha podido cargar la encuesta. Inténtalo de nuevo.'));
