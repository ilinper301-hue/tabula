// Tabula · Documentos · fichas hechas con Claude: pegar, compartir e instrucciones del Proyecto
import { store } from '../../store.js';
import { h, icon, openSheet, toast } from '../../ui.js';
import { saveFile } from '../../files.js';
import { fromClaude, sanitizeHtml, fileNameFor, claudeProjectInstructions } from '../../fichas.js';
import { getGroups } from '../../school.js';

/** Guarda una ficha HTML como documento. */
export async function saveFicha(html, titulo, opts = {}) {
  const clean = sanitizeHtml(html);
  const file = new File([clean], fileNameFor(titulo), { type: 'text/html' });
  const saved = await saveFile(file);
  return store.add('documentos', {
    titulo: titulo || 'Ficha', fileId: saved.fileId, nombreArchivo: saved.nombre, tipo: 'text/html', tamano: saved.tamano,
    paginas: null, miniatura: null, carpeta: opts.carpeta || '', etiquetas: ['Claude'], notas: '', favorito: false, origen: 'claude',
  });
}

/**
 * Hoja «Pegar de Claude»: se pega la ficha (HTML, Markdown o texto), se ve cómo queda y se guarda.
 * @param opts { carpeta, text, onSaved(doc) }
 */
export function openPasteSheet(opts = {}) {
  let parsed = null;
  let pastedHtml = '';
  const area = h('textarea', {
    class: 'textarea dc-cl-input', rows: 7, spellcheck: 'false', 'aria-label': 'Ficha copiada de Claude',
    placeholder: 'Pega aquí la ficha que te ha hecho Claude (el bloque de código HTML o el texto de la respuesta)',
  });
  const title = h('input', { class: 'input', type: 'text', maxlength: 90, placeholder: 'Título de la ficha', 'aria-label': 'Título' });
  const frame = h('iframe', { class: 'dc-cl-frame', title: 'Vista previa de la ficha', sandbox: '' });
  const previewWrap = h('div', { class: 'dc-cl-preview', hidden: true }, h('div', { class: 'dc-cl-page' }, frame));
  const info = h('p', { class: 'dc-cl-info', role: 'status' });
  const saveBtn = h('button', { type: 'submit', class: 'btn btn-primary', disabled: true }, icon('check', 16), 'Guardar en Documentos');
  let titleTouched = false;
  title.addEventListener('input', () => { titleTouched = true; });

  const refresh = () => {
    const txt = area.value.trim();
    if (!txt && !pastedHtml) { parsed = null; previewWrap.hidden = true; saveBtn.disabled = true; info.textContent = ''; return; }
    parsed = fromClaude(txt, pastedHtml);
    frame.srcdoc = sanitizeHtml(parsed.html);
    previewWrap.hidden = false;
    requestAnimationFrame(() => { const w = frame.parentElement.clientWidth; if (w) frame.style.transform = `scale(${w / 794})`; });
    saveBtn.disabled = false;
    if (!titleTouched) title.value = parsed.titulo;
    info.textContent = parsed.formato === 'html' ? 'Ficha en HTML: se imprimirá tal cual la diseñó Claude.' : 'Texto convertido a ficha A4 con espacio para nombre y fecha.';
  };
  area.addEventListener('input', () => { pastedHtml = ''; refresh(); });
  area.addEventListener('paste', (e) => {
    const cd = e.clipboardData;
    const files = cd ? [...(cd.files || [])] : [];
    if (files.length) { e.preventDefault(); saveFiles(files); return; }
    const html = cd && cd.getData('text/html');
    if (html && !/```/.test(cd.getData('text/plain') || '')) pastedHtml = html;
    setTimeout(refresh, 0);
  });

  const pasteBtn = navigator.clipboard?.readText ? h('button', {
    type: 'button', class: 'btn btn-sm', onclick: async () => {
      try { area.value = await navigator.clipboard.readText(); pastedHtml = ''; refresh(); }
      catch { area.focus(); toast('Mantén pulsado el cuadro y elige «Pegar»'); }
    },
  }, icon('download', 14), 'Pegar') : null;

  // PDF, imágenes o archivos (p. ej. el PDF que Claude deja descargar): se guardan tal cual
  const saveFiles = async (files) => {
    if (!files.length) return;
    const { uploadFiles } = await import('./upload.js');
    const created = await uploadFiles(files, { carpeta: opts.carpeta || '' }, (t) => { info.textContent = t || ''; });
    if (created.length) { close(); opts.onSaved && opts.onSaved(created[0]); }
  };
  const pickPdf = async () => {
    const { pickFiles } = await import('./upload.js');
    saveFiles(await pickFiles());
  };
  const pdfCard = h('div', { class: 'dc-cl-pdf' },
    h('span', { class: 'dc-cl-pdf-ic', 'aria-hidden': 'true' }, icon('documentos', 20)),
    h('div', { class: 'dc-cl-pdf-tx' }, h('strong', {}, '¿Claude te ha dado un PDF?'),
      h('span', {}, 'Descárgalo y elígelo aquí: está en Archivos (iPad) o en Descargas (Android y ordenador).')),
    h('button', { type: 'button', class: 'btn btn-sm', onclick: pickPdf }, icon('upload', 14), 'Elegir archivo'));

  const submit = async (e) => {
    e.preventDefault();
    if (!parsed) return;
    saveBtn.disabled = true;
    try {
      const doc = await saveFicha(parsed.html, title.value.trim() || parsed.titulo, opts);
      close();
      toast(`«${doc.titulo}» guardada en Documentos`);
      opts.onSaved && opts.onSaved(doc);
    } catch (err) {
      console.warn(err); saveBtn.disabled = false; toast('No se pudo guardar la ficha');
    }
  };

  const form = h('form', { class: 'dc-cl', onsubmit: submit, novalidate: true },
    h('div', { class: 'dc-cl-steps' },
      h('span', {}, h('b', {}, '1'), 'Pide la ficha en Claude'),
      h('span', {}, h('b', {}, '2'), 'Copia la respuesta'),
      h('span', {}, h('b', {}, '3'), 'Pégala aquí')),
    h('div', { class: 'dc-cl-row' }, area),
    h('div', { class: 'dc-cl-tools' }, pasteBtn,
      h('button', { type: 'button', class: 'link-btn', onclick: () => openClaudeHelp() }, '¿Cómo pedir fichas a Claude?')),
    pdfCard,
    previewWrap, info,
    h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Título'), title),
    h('div', { class: 'dc-cl-actions' }, h('button', { type: 'button', class: 'btn', onclick: () => close() }, 'Cancelar'), saveBtn));

  const close = openSheet('Pegar de Claude', form);
  if (opts.text) { area.value = opts.text; refresh(); }
  return close;
}

/** Instrucciones para crear un Proyecto en Claude que haga fichas listas para Tabula. */
export function openClaudeHelp() {
  const profile = store.getSetting('profile', {}) || {};
  const tut = getGroups().find((g) => g.tutoria) || getGroups()[0];
  const text = claudeProjectInstructions({ curso: tut ? `${tut.curso}.º de Primaria` : '', centro: profile.centro || '' });
  const pre = h('pre', { class: 'dc-cl-pre', tabindex: '0' }, text);
  const copy = h('button', {
    type: 'button', class: 'btn btn-primary', onclick: async () => {
      try { await navigator.clipboard.writeText(text); toast('Instrucciones copiadas'); }
      catch { const r = document.createRange(); r.selectNodeContents(pre); const s = getSelection(); s.removeAllRanges(); s.addRange(r); toast('Selecciónalo y cópialo'); }
    },
  }, icon('check', 16), 'Copiar instrucciones');
  const step = (n, t, d) => h('li', {}, h('b', {}, String(n)), h('div', {}, h('strong', {}, t), d ? h('span', {}, d) : null));
  openSheet('Fichas con Claude', h('div', { class: 'dc-cl-help' },
    h('p', { class: 'dc-cl-lead' }, 'Con tu suscripción de Claude puedes crear fichas y guardarlas aquí sin pagar nada más.'),
    h('ol', { class: 'dc-cl-howto' },
      step(1, 'Crea un Proyecto en Claude', 'Por ejemplo «Fichas de clase». En sus instrucciones, pega el texto de abajo. Solo se hace una vez.'),
      step(2, 'Pide la ficha', '«Ficha de sumas llevando para 1.º, 8 ejercicios con dibujos», «Comprensión lectora sobre el otoño con 5 preguntas»…'),
      step(3, 'Copia el bloque de código', 'Claude te dará la ficha en un bloque HTML. Pulsa «Copiar». Si te la da en PDF, descárgala: también vale.'),
      step(4, 'Llévala a Tabula', 'Documentos → «Pegar de Claude»: pega el código o pulsa «Elegir archivo» para el PDF descargado. En Android también puedes usar Compartir → Tabula.')),
    h('h3', { class: 'section-label' }, 'Instrucciones del Proyecto'),
    pre, copy,
    h('p', { class: 'dc-cl-note' }, 'Consejo: no escribas nombres de alumnos en Claude; para adaptar una ficha basta con decir «para un alumno con dificultades en lectura».')));
}

/** Importa lo recibido con «Compartir → Tabula». Devuelve true si había algo. */
let importing = false;
export async function importShared({ upload, carpeta = '' }) {
  if (importing) return false;
  importing = true;
  try {
    const { listShared, removeShared } = await import('../../files.js');
    const items = await listShared();
    if (!items.length) return false;
    const files = items.filter((it) => it.file);
    const texts = items.filter((it) => !it.file && (it.text || it.url)).map((it) => [it.title, it.text, it.url].filter(Boolean).join('\n'));
    if (files.length) await upload(files.map((it) => it.file));
    await removeShared(items.map((it) => it.key));
    if (texts.length) openPasteSheet({ carpeta, text: texts.join('\n\n') });
    return true;
  } finally { importing = false; }
}

export { getGroups };
