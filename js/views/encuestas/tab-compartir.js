// Tabula · Encuestas · pestaña «Compartir» (publicar, enlace, mensaje, abrir/cerrar y eliminar)
import { h, icon, toast } from '../../ui.js';
import { validateSurvey, canPublish, NEED_CLOUD, surveyLink, setSurveyOpen, deleteSurvey } from '../../surveys.js';
import { publicSig, minutesFor } from './model.js';
import { eicon, copyText, friendlyError, inlineConfirm, plural, stateChip } from './common.js';

export function createSharePanel(ctx) {
  const el = h('div', { class: 'enc-share' });
  let busy = false;
  let error = '';
  let message = null; // texto del mensaje si el docente lo ha editado
  let lastSig = '';

  const sigNow = () => {
    const s = ctx.survey(); const st = ctx.stored() || {};
    return [st.publicId, st.estado, canPublish(), st.publicadaSig !== publicSig(s), validateSurvey(s).join('|'), busy, error].join('§');
  };

  async function run(fn, okMsg) {
    if (busy) return;
    busy = true; error = ''; paint();
    try { await fn(); if (okMsg) toast(okMsg); }
    catch (e) { error = friendlyError(e); }
    busy = false; paint();
  }

  const needCloud = () => h('p', { class: 'enc-note', role: 'status' }, NEED_CLOUD, ' ', h('a', { href: '#/ajustes' }, 'Ir a Ajustes'));
  const errBox = () => (error ? h('p', { class: 'enc-error', role: 'alert' }, error) : null);

  // ---------- Borrador: publicar ----------
  function paintDraft(s) {
    const errors = validateSurvey(s);
    const ok = canPublish();
    el.replaceChildren(...[h('section', { class: 'card enc-hero' },
      h('div', { class: 'enc-hero-icon' }, eicon('link', 28)),
      h('h2', { class: 'enc-h2' }, 'Publica la encuesta para compartirla'),
      h('p', { class: 'enc-lead' }, 'Se crea un enlace que tus compañeros abren desde el móvil o el ordenador, sin cuenta ni instalar nada. Podrás cerrarlo cuando quieras y las respuestas llegarán aquí.'),
      errors.length ? h('div', { class: 'enc-errors', role: 'status' },
        h('strong', {}, 'Antes de publicar:'), h('ul', {}, ...errors.map((e) => h('li', {}, e))),
        h('button', { type: 'button', class: 'link-btn', onclick: () => ctx.go('editar') }, 'Volver a editar')) : null,
      !ok ? needCloud() : null,
      h('button', { type: 'button', class: 'btn btn-primary enc-big', disabled: !!errors.length || !ok || busy,
        onclick: () => run(() => ctx.publish(), 'Encuesta publicada') }, eicon('send', 20), busy ? 'Publicando…' : 'Publicar y obtener enlace'),
      errBox()),
      deleteCard()].filter(Boolean));
  }

  // ---------- Publicada ----------
  function paintPublished(s, st) {
    const link = surveyLink(st);
    const dirty = st.publicadaSig !== publicSig(s);
    const errors = validateSurvey(s);
    const ok = canPublish();
    const input = h('input', { class: 'input enc-link', readonly: true, value: link, 'aria-label': 'Enlace de la encuesta', onfocus: (e) => e.target.select() });
    const copy = async () => { if (await copyText(link, input)) toast('Enlace copiado'); };
    const canShare = typeof navigator.share === 'function';
    const defMsg = `Hola, ¿podéis responder esta encuesta sobre «${(s.titulo || '').trim()}»? Son ${minutesFor(s.preguntas.length) === 1 ? '1 minuto' : `${minutesFor(s.preguntas.length)} minutos`}: ${link}`;
    const msg = h('textarea', { class: 'textarea enc-msg', rows: '4', 'aria-label': 'Mensaje para enviar', oninput: (e) => { message = e.target.value; } });
    msg.value = message ?? defMsg;
    const open = st.estado === 'abierta';
    const nResp = ctx.responses().length;

    const openSwitch = h('input', { type: 'checkbox', class: 'switch', checked: open, disabled: busy || !ok, 'aria-describedby': 'enc-open-help',
      onchange: (e) => { const v = e.target.checked; run(() => setSurveyOpen(ctx.id, v), v ? 'Encuesta abierta' : 'Encuesta cerrada'); } });

    el.replaceChildren(...[
      dirty ? h('div', { class: 'enc-banner', role: 'status' }, icon('flag', 18),
        h('span', {}, errors.length ? 'Has cambiado la encuesta, pero hay cosas por completar antes de actualizarla.' : 'Has cambiado la encuesta y tus compañeros aún no ven los cambios.'),
        h('button', { type: 'button', class: 'btn btn-primary btn-sm', disabled: !!errors.length || !ok || busy, onclick: () => run(() => ctx.publish(), 'Encuesta actualizada') }, 'Actualizar encuesta publicada')) : null,
      h('section', { class: 'card' },
        h('div', { class: 'card-head' }, h('h2', { class: 'card-title' }, 'Enlace para tus compañeros'), stateChip(st)),
        input,
        h('div', { class: 'enc-actions' },
          h('button', { type: 'button', class: 'btn btn-primary', onclick: copy }, eicon('copy', 18), 'Copiar enlace'),
          canShare ? h('button', { type: 'button', class: 'btn', onclick: () => navigator.share({ title: s.titulo, text: msg.value.replace(link, '').trim(), url: link }).catch(() => {}) }, eicon('share', 18), 'Compartir…') : null,
          h('a', { class: 'btn', href: link, target: '_blank', rel: 'noopener' }, eicon('external', 18), 'Abrir')),
        !open ? h('p', { class: 'enc-note' }, 'La encuesta está cerrada: quien abra el enlace verá «Encuesta cerrada».') : null),
      h('section', { class: 'card' },
        h('h2', { class: 'card-title' }, 'Mensaje para WhatsApp o correo'),
        h('p', { class: 'enc-hint' }, 'Cópialo y pégalo donde quieras; puedes cambiar el texto.'),
        msg,
        h('div', { class: 'enc-actions' }, h('button', { type: 'button', class: 'btn', onclick: async () => { if (await copyText(msg.value, msg)) toast('Mensaje copiado'); } }, eicon('copy', 18), 'Copiar mensaje'))),
      h('section', { class: 'card' },
        h('label', { class: 'switch-row enc-open-row' },
          h('span', {}, h('strong', {}, 'Admite respuestas'), h('span', { class: 'enc-hint', id: 'enc-open-help', style: { display: 'block' } },
            open ? 'Abierta: cualquiera con el enlace puede responder (y cambiar su respuesta). Ciérrala cuando tengas las que necesitas.'
              : 'Cerrada: el enlace sigue existiendo pero ya no admite respuestas. Puedes reabrirla cuando quieras.')),
          openSwitch),
        !ok ? needCloud() : null, errBox()),
      deleteCard(nResp)].filter(Boolean));
  }

  function deleteCard(nResp = 0) {
    const st = ctx.stored();
    const { trigger, box } = inlineConfirm({
      label: 'Eliminar encuesta…', yes: 'Sí, eliminar para siempre',
      question: st?.publicId
        ? `Se borrará el enlace (dejará de funcionar) y ${nResp ? plural(nResp, 'respuesta recibida', 'respuestas recibidas') : 'las respuestas que lleguen'}. No se puede deshacer.`
        : 'Se borrará este borrador. No se puede deshacer.',
      onYes: () => run(async () => { await deleteSurvey(ctx.id); toast('Encuesta eliminada'); location.hash = '#/encuestas'; }),
    });
    return h('section', { class: 'card enc-danger-zone' }, h('h2', { class: 'card-title' }, 'Eliminar'),
      h('p', { class: 'enc-hint' }, 'Borra la encuesta, su enlace y todas las respuestas recibidas.'), trigger, box);
  }

  function paint() {
    lastSig = sigNow();
    const s = ctx.survey(); const st = ctx.stored();
    if (!st) return;
    if (!st.publicId) paintDraft(s); else paintPublished(s, st);
  }
  paint();

  return {
    el,
    update() { if (sigNow() !== lastSig && !el.contains(document.activeElement?.closest?.('textarea'))) paint(); },
    destroy() {},
  };
}
