// Tabula · Tutoría · acta de una reunión (A4 limpio, impresa desde un iframe oculto)
import { TIPOS_REUNION, MODALIDADES, INICIATIVA, ESTADOS_REUNION } from '../../tutoria.js';
import { fullName } from '../../school.js';
import { longDate } from './common.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const multiline = (s) => esc(s).replace(/\n/g, '<br>');

const CSS = `
@page { size: A4; margin: 18mm 20mm; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body { font: 11pt/1.5 system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1c1b19; -webkit-print-color-adjust: exact; print-color-adjust: exact; min-height: 255mm; display: flex; flex-direction: column; }
h1, h2 { font-family: 'Source Serif 4', Georgia, 'Times New Roman', serif; font-weight: 500; }
.top { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 1.5px solid #3E5C76; padding-bottom: 6px; font-size: 9.5pt; color: #55544f; }
.top strong { color: #3E5C76; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; font-size: 8.5pt; }
h1 { font-size: 24pt; margin: 18px 0 2px; letter-spacing: -.01em; line-height: 1.1; }
.sub { color: #66655f; margin: 0 0 14px; }
dl.meta { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 22px; padding: 12px 0; border-top: 1px solid #ddd9cd; border-bottom: 1px solid #ddd9cd; margin: 0 0 4px; }
.meta dt { font-size: 7.5pt; text-transform: uppercase; letter-spacing: .09em; color: #77766f; margin: 0 0 1px; }
.meta dd { margin: 0; font-weight: 600; }
.meta .full { grid-column: 1 / -1; }
h2 { font-size: 13pt; margin: 20px 0 6px; color: #3E5C76; }
.box { border: 1px solid #ddd9cd; border-radius: 8px; padding: 10px 14px; background: #FAF9F5; min-height: 22mm; }
ul.ag { list-style: none; margin: 0; padding: 0; }
ul.ag li { display: flex; gap: 10px; padding: 6px 0; border-bottom: 1px solid #ece9e0; }
ul.ag .bx { width: 12px; height: 12px; border: 1.4px solid #55544f; border-radius: 3px; margin-top: 4px; flex-shrink: 0; text-align: center; line-height: 9px; font-size: 10px; }
ul.ag .when { margin-left: auto; color: #77766f; font-size: 9.5pt; white-space: nowrap; }
.muted { color: #77766f; }
.sign { margin-top: auto; padding-top: 22mm; display: grid; grid-template-columns: 1fr 1fr; gap: 24mm; }
.sign div { border-top: 1px solid #1c1b19; padding-top: 5px; font-size: 9.5pt; text-align: center; }
.foot { margin-top: 10px; font-size: 8pt; color: #99978e; text-align: right; }
`;

/**
 * HTML completo del acta.
 * @param r reunión (o borrador con la misma forma)  @param ctx { students: [], profile: {nombre, centro}, group }
 */
export function buildActaHTML(r, { students = [], profile = {}, group = null } = {}) {
  const names = (r.studentIds || []).map((id) => students.find((s) => s.id === id)).filter(Boolean).map(fullName);
  const ac = r.acuerdos || [];
  const meta = [
    ['Fecha', `${r.fecha ? longDate(r.fecha) : '—'}${r.hora ? ` · ${r.hora} h` : ''}`],
    ['Tipo', TIPOS_REUNION[r.tipo] || ''],
    ['Modalidad', MODALIDADES[r.modalidad] || ''],
    ['Convocada', INICIATIVA[r.iniciativa] || ''],
    names.length ? [r.tipo === 'familia' ? 'Alumnado' : 'Alumnado tratado', names.join(', '), true] : null,
    r.asistentes ? ['Asistentes', r.asistentes, true] : null,
  ].filter(Boolean);
  const body = `
  <div class="top"><strong>Acta de reunión</strong><span>${esc([profile.centro, group && group.nombre].filter(Boolean).join(' · '))}</span></div>
  <h1>${esc(TIPOS_REUNION[r.tipo] || 'Reunión')}</h1>
  <p class="sub">${esc(ESTADOS_REUNION[r.estado] || '')}</p>
  <dl class="meta">${meta.map(([k, v, full]) => `<div${full ? ' class="full"' : ''}><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
  <h2>Motivo</h2><div class="box">${r.motivo ? multiline(r.motivo) : '<span class="muted">—</span>'}</div>
  <h2>Resumen de lo tratado</h2><div class="box" style="min-height:45mm">${r.resumen ? multiline(r.resumen) : '<span class="muted">—</span>'}</div>
  <h2>Acuerdos</h2>
  ${ac.length ? `<ul class="ag">${ac.map((a) => `<li><span class="bx">${a.hecho ? '✓' : ''}</span><span>${esc(a.texto)}</span>${a.fecha ? `<span class="when">${esc(a.fecha.split('-').reverse().join('/'))}</span>` : ''}</li>`).join('')}</ul>` : '<p class="muted">Sin acuerdos.</p>'}
  ${r.seguimiento ? `<p class="muted">Seguimiento previsto: ${esc(longDate(r.seguimiento))}.</p>` : ''}
  <div class="sign"><div>${esc(profile.nombre || 'El tutor o la tutora')}<br><span class="muted">Tutor/a</span></div><div>Familia o participantes<br><span class="muted">Enterados</span></div></div>
  <p class="foot">Documento confidencial · generado con Tabula</p>`;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Acta de reunión</title><style>${CSS}</style></head><body>${body}</body></html>`;
}

/** Imprime el acta con un iframe oculto (no toca la página de la app). */
export function printActa(r, ctx) {
  document.querySelectorAll('iframe.tu-print-frame').forEach((f) => f.remove());
  const frame = document.createElement('iframe');
  frame.className = 'tu-print-frame';
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  frame.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0;visibility:hidden';
  frame.srcdoc = buildActaHTML(r, ctx);
  frame.addEventListener('load', () => {
    const w = frame.contentWindow;
    if (!w) return;
    w.addEventListener('afterprint', () => setTimeout(() => frame.remove(), 500));
    setTimeout(() => {
      try { w.focus(); w.print(); } catch (e) { console.warn('No se pudo imprimir', e); }
      frame.blur(); // el foco vuelve a la página (Esc sigue cerrando las hojas)
    }, 250);
  });
  document.body.append(frame);
  setTimeout(() => frame.remove(), 10 * 60 * 1000);
  return frame;
}
