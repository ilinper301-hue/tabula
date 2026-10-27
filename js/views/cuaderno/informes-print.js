// Tabula · Cuaderno · Informes · impresión (documentos A4 limpios en un iframe oculto)
import { LEVEL_LABELS, formatGrade, toLevel } from '../../grading.js';
import { CLAVES, CLAVE_CORTA, gradoAdquisicion } from '../../competencias.js';
import { senecaGrade, areaPhrase } from '../../informes.js';
import { areaShort } from '../../school.js';

/** Escapa texto de usuario para insertarlo en HTML. */
export const escapeHTML = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const esc = escapeHTML;
const num1 = (n) => formatGrade(n, 'numerica');
const fechaLarga = (d = new Date()) => d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });

const CSS = `
@page { size: A4; margin: 16mm 18mm; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body { font: 10.5pt/1.45 system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1c1b19; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
h1, h2, h3, .serif { font-family: 'Source Serif 4', Georgia, 'Times New Roman', serif; font-weight: 500; }
.rep { page-break-after: always; break-after: page; min-height: 255mm; display: flex; flex-direction: column; }
.rep:last-child { page-break-after: auto; break-after: auto; }
.rep-top { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 1.5px solid #3E5C76; padding-bottom: 6px; font-size: 9.5pt; color: #55544f; letter-spacing: .02em; }
.rep-top strong { color: #3E5C76; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; font-size: 8.5pt; }
h1 { font-size: 24pt; margin: 18px 0 2px; letter-spacing: -.01em; line-height: 1.1; }
.sub { color: #66655f; margin: 0 0 14px; font-size: 10.5pt; }
.meta { display: grid; grid-template-columns: 1.6fr 1fr 1fr; gap: 10px 18px; padding: 10px 0 12px; border-bottom: 1px solid #ddd9cd; margin-bottom: 4px; }
.meta dt { font-size: 7.5pt; text-transform: uppercase; letter-spacing: .09em; color: #77766f; margin: 0 0 1px; }
.meta dd { margin: 0; font-weight: 600; font-size: 11pt; }
h2 { font-size: 13pt; margin: 18px 0 6px; color: #3E5C76; }
table { width: 100%; border-collapse: collapse; }
th { text-align: left; font-size: 7.5pt; text-transform: uppercase; letter-spacing: .08em; color: #77766f; font-weight: 600; padding: 4px 8px 4px 0; border-bottom: 1px solid #c9c5b8; }
td { padding: 6px 8px 6px 0; border-bottom: 1px solid #ece9e0; vertical-align: middle; }
td.n, th.n { text-align: center; width: 15mm; }
.lv { display: inline-block; min-width: 22px; text-align: center; padding: 1px 6px; border-radius: 4px; font-size: 8.5pt; font-weight: 600; background: #EDF1F5; color: #34495E; }
.lv-IN { background: #FBE9E0; color: #7A3E22; } .lv-SU { background: #F7F2E3; color: #6A5520; } .lv-BI { background: #EDF1F5; color: #34495E; }
.lv-NT { background: #EEF2EA; color: #435536; } .lv-SB { background: #E2EEEB; color: #2F5550; }
.muted { color: #77766f; }
.bar { height: 6px; background: #ece9e0; border-radius: 3px; overflow: hidden; width: 100%; }
.bar i { display: block; height: 100%; background: #5A80A3; border-radius: 3px; }
.cl td:first-child { width: 46mm; }
.cl .id { font-weight: 600; margin-right: 6px; }
.cl td.bar-c { width: 50mm; }
.cl td.g { width: 30mm; text-align: right; padding-right: 0; font-size: 9.5pt; }
.coment { border: 1px solid #ddd9cd; border-radius: 8px; padding: 10px 14px; background: #FAF9F5; white-space: pre-wrap; min-height: 28mm; font-size: 10.5pt; line-height: 1.55; }
.att { margin-top: 12px; font-size: 9.5pt; color: #55544f; }
.sign { margin-top: auto; padding-top: 18mm; display: grid; grid-template-columns: 1fr 1fr; gap: 24mm; }
.sign div { border-top: 1px solid #1c1b19; padding-top: 5px; font-size: 9.5pt; text-align: center; }
.sign small { display: block; color: #77766f; font-size: 8.5pt; }
.foot { margin-top: 10px; font-size: 8pt; color: #99978e; text-align: right; }
.grp { font-size: 9pt; }
.grp td, .grp th { padding: 4px 6px; }
.grp td.c { text-align: center; }
.grp tfoot td { font-weight: 600; border-top: 1.5px solid #3E5C76; }
.legend { font-size: 8pt; color: #66655f; margin-top: 8px; }
`;

function doc(title, body, landscape = false) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${CSS}${landscape ? '@page { size: A4 landscape; margin: 12mm 14mm; }' : ''}</style></head><body>${body}</body></html>`;
}

const lvPill = (nota, text) => {
  const l = toLevel(nota);
  return l ? `<span class="lv lv-${l}">${esc(text ?? l)}</span>` : '<span class="muted">—</span>';
};

/**
 * Informe para familias de UN alumno (una página A4).
 * r = { student, group, evLabel, curso, profile:{nombre, centro}, areas:[{area, nota}], claves:[{id, nota}],
 *       comentario, asistencia:{faltas, retrasos, justificadas, dias, pct}|null, fecha }
 */
export function reportPage(r) {
  const tutor = r.profile?.nombre ? esc(r.profile.nombre) : '';
  const nombre = [r.student.nombre, r.student.apellidos].filter(Boolean).join(' ');
  const areasRows = r.areas.map((a) => {
    const g = senecaGrade(a.nota);
    return `<tr><td>${esc(a.area)}</td><td class="n">${g ? g.num : '<span class="muted">—</span>'}</td>
      <td class="n">${g ? lvPill(a.nota, g.cal) : ''}</td>
      <td>${g ? esc(`${LEVEL_LABELS[g.cal]}. ${areaPhrase(a.nota)}`) : '<span class="muted">Sin evaluar</span>'}</td></tr>`;
  }).join('');
  const claves = r.claves.filter((c) => c.nota !== null);
  const clavesRows = claves.map((c) => `<tr><td><span class="id">${esc(c.id)}</span><span class="muted">${esc(CLAVE_CORTA[c.id] || '')}</span></td>
    <td class="bar-c"><div class="bar"><i style="width:${Math.max(0, Math.min(100, c.nota * 10))}%"></i></div></td>
    <td class="g">${esc(gradoAdquisicion(c.nota) || '')}</td></tr>`).join('');
  const att = r.asistencia
    ? `<p class="att">Asistencia en el curso: ${r.asistencia.faltas + r.asistencia.justificadas} falta${r.asistencia.faltas + r.asistencia.justificadas === 1 ? '' : 's'} (${r.asistencia.justificadas} justificada${r.asistencia.justificadas === 1 ? '' : 's'}) y ${r.asistencia.retrasos} retraso${r.asistencia.retrasos === 1 ? '' : 's'} en ${r.asistencia.dias} días registrados.</p>` : '';
  return `<section class="rep">
    <div class="rep-top"><strong>${esc(r.profile?.centro || 'Informe de evaluación')}</strong><span>Curso ${esc(r.curso || '')}</span></div>
    <h1>Informe de evaluación</h1>
    <p class="sub">${esc(r.evLabel)}</p>
    <dl class="meta"><div><dt>Alumno/a</dt><dd>${esc(nombre)}</dd></div><div><dt>Grupo</dt><dd>${esc(r.group?.nombre || '')}</dd></div><div><dt>Fecha</dt><dd>${esc(r.fecha)}</dd></div></dl>
    <h2>Áreas</h2>
    ${r.areas.length ? `<table><thead><tr><th>Área</th><th class="n">Nota</th><th class="n">Nivel</th><th>Valoración</th></tr></thead><tbody>${areasRows}</tbody></table>` : '<p class="muted">Aún no hay áreas evaluadas.</p>'}
    ${claves.length ? `<h2>Competencias clave</h2><table class="cl"><tbody>${clavesRows}</tbody></table>` : ''}
    <h2>Comentario del tutor o tutora</h2>
    <div class="coment">${r.comentario ? esc(r.comentario) : '&nbsp;'}</div>
    ${att}
    <div class="sign"><div>Familia<small>Enterado/a</small></div><div>El tutor / La tutora<small>${tutor}</small></div></div>
    <p class="foot">Tabula</p>
  </section>`;
}

export const reportsDocument = (pages, title = 'Informe de evaluación') => doc(title, pages.join(''));

/** Perfil competencial del grupo en una tabla apaisada. */
export function groupProfileDocument({ group, evLabel, curso, profile, students, profiles, means, fullName }) {
  const head = CLAVES.map((c) => `<th class="c" title="${esc(c.nombre)}">${esc(c.id)}</th>`).join('');
  const cell = (n) => `<td class="c">${n === null || n === undefined ? '<span class="muted">·</span>' : lvPill(n, `${toLevel(n)} · ${num1(n)}`)}</td>`;
  const rows = students.map((s) => `<tr><td>${esc(fullName(s))}</td>${CLAVES.map((c) => cell(profiles[s.id].claves[c.id].nota)).join('')}${cell(profiles[s.id].global)}</tr>`).join('');
  const foot = `<tr><td>Media del grupo</td>${CLAVES.map((c) => cell(means[c.id])).join('')}${cell(null)}</tr>`;
  const legend = CLAVES.map((c) => `<b>${esc(c.id)}</b> ${esc(CLAVE_CORTA[c.id])}`).join(' · ');
  const body = `<section>
    <div class="rep-top"><strong>${esc(profile?.centro || 'Perfil competencial')}</strong><span>Curso ${esc(curso || '')} · ${esc(fechaLarga())}</span></div>
    <h1 style="font-size:20pt">Perfil competencial · ${esc(group?.nombre || '')}</h1>
    <p class="sub">${esc(evLabel)} · Nivel de cada competencia clave (media de los descriptores evaluados en todas las áreas)</p>
    <table class="grp"><thead><tr><th>Alumnado</th>${head}<th class="c">Global</th></tr></thead><tbody>${rows}</tbody><tfoot>${foot}</tfoot></table>
    <p class="legend">${legend}</p></section>`;
  return doc('Perfil competencial', body, true);
}

/** Imprime un documento HTML completo a través de un iframe oculto (no toca la página de la app). */
export function printHTML(html) {
  document.querySelectorAll('iframe.cb-print-frame').forEach((f) => f.remove());
  const frame = document.createElement('iframe');
  frame.className = 'cb-print-frame';
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  frame.srcdoc = html;
  const cleanup = () => setTimeout(() => frame.remove(), 500);
  frame.addEventListener('load', () => {
    const w = frame.contentWindow;
    if (!w) return;
    w.addEventListener('afterprint', cleanup);
    // Dejamos un momento para que carguen las fuentes y se pinte el documento
    setTimeout(() => { try { w.focus(); w.print(); } catch (e) { console.warn('No se pudo imprimir', e); } }, 250);
  });
  document.body.append(frame);
  // Si el navegador no avisa del final de la impresión, se retira pasado un rato
  setTimeout(() => frame.remove(), 10 * 60 * 1000);
  return frame;
}

export { areaShort };
