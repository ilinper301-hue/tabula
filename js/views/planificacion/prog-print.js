// Tabula · Planificación · «Programación»: semana imprimible (A4 apaisado) con un marco oculto.
// Todo el texto del usuario se escapa; el documento no lleva scripts.
import { areaShort } from '../../school.js';
import { fromISO, DIAS } from '../../ui.js';
import { weekLabel } from './prog-model.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dayHead = (iso) => { const d = fromISO(iso); return `${DIAS[d.getDay()]} ${d.getDate()}`; };
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * HTML de la semana.
 * @param model resultado de weekModel
 * @param opts { profile:{nombre, centro}, grupoNombre:string, sitTitle:(id)=>string, multi:boolean }
 */
export function buildWeekPrintHTML(model, { profile = {}, grupoNombre = '', sitTitle = () => '', multi = false } = {}) {
  const { days, rows, stats } = model;
  const nol = days.map((d) => (d.lectivo ? null : (d.nolec[0]?.titulo || 'No lectivo')));
  const head = days.map((d, i) => `<th class="${nol[i] ? 'nl' : ''}">${esc(cap(dayHead(d.iso)))}${d.events.filter((e) => e.tipo !== 'nolectivo').map((e) => `<small>${esc(e.titulo)}</small>`).join('')}</th>`).join('');
  const body = rows.map((r, ri) => {
    const tds = days.map((d, i) => {
      if (nol[i]) return ri === 0 ? `<td class="nl" rowspan="${rows.length}"><span>${esc(nol[i])}</span></td>` : '';
      const items = r.cells[i];
      if (!items.length) return '<td class="e"></td>';
      return `<td>${items.map(({ block, plan, group }) => {
        if (block.tipo !== 'clase') return `<div class="brk">${esc(block.titulo || (block.tipo === 'recreo' ? 'Recreo' : 'Otra actividad'))}</div>`;
        const meta = [areaShort(block.area), multi && group ? group.nombre : ''].filter(Boolean).join(' · ');
        return `<div class="cl"><b>${esc(meta)}</b>${plan
          ? `<span class="t${plan.estado === 'hecha' ? ' done' : ''}">${esc(plan.titulo || 'Sesión')}${plan.estado === 'hecha' ? ' ✓' : ''}</span><small>${esc(sitTitle(plan.situacionId))}</small>`
          : '<span class="free">—</span>'}</div>`;
      }).join('')}</td>`;
    }).join('');
    return `<tr class="${r.thin ? 'thin' : ''}"><th class="tm">${esc(r.inicio)}<small>${esc(r.fin)}</small></th>${tds}</tr>`;
  }).join('');
  const who = [profile.nombre, grupoNombre].filter(Boolean).join(' · ');
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(`Programación ${weekLabel(model.monday)}`)}</title>
<style>
@page{size:A4 landscape;margin:10mm}
*{box-sizing:border-box}html,body{margin:0}
body{font:10pt/1.3 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#141413}
header{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:1.5pt solid #141413;padding-bottom:5pt;margin-bottom:8pt}
h1{font:500 17pt Georgia,"Times New Roman",serif;margin:0}
header p{margin:0;text-align:right;color:#3D3C38;font-size:9pt}
table{width:100%;border-collapse:collapse;table-layout:fixed}
th,td{border:.6pt solid #9b978c;padding:4pt 5pt;vertical-align:top;text-align:left}
thead th{background:#EFECE4;font-size:9.5pt}
thead small{display:block;font-weight:400;color:#3D3C38;font-size:7.5pt}
.tm{width:17mm;background:#F6F4EE;font-size:9pt;white-space:nowrap}.tm small{display:block;font-weight:400;color:#66655F}
tr{break-inside:avoid}
.cl+.cl{margin-top:4pt;padding-top:3pt;border-top:.4pt dotted #9b978c}
.cl b{display:block;font-size:8pt;text-transform:uppercase;letter-spacing:.3pt;color:#3D3C38}
.cl .t{display:block;font-weight:600;font-size:9.5pt}.cl .t.done{color:#435536}
.cl small{display:block;color:#66655F;font-size:7.5pt}.cl .free{color:#9b978c}
.brk{color:#66655F;font-size:8pt;font-style:italic}
tr.thin td,tr.thin th{padding:1.5pt 5pt;height:auto}
td.e{background:#fff}
.nl{background:#F7F2E3 repeating-linear-gradient(135deg,transparent 0 5pt,#e6dcc0 5pt 6pt);text-align:center;vertical-align:middle;color:#6A5520}
td.nl span{display:block;writing-mode:vertical-rl;margin:0 auto;font-weight:600;font-size:10pt}
footer{margin-top:6pt;font-size:8pt;color:#66655F;display:flex;justify-content:space-between}
</style></head><body>
<header><div><h1>Programación semanal</h1><div>${esc(weekLabel(model.monday))}</div></div>
<p>${esc(profile.centro || '')}${profile.centro && who ? '<br>' : ''}${esc(who)}</p></header>
<table><thead><tr><th class="tm"></th>${head}</tr></thead><tbody>${body}</tbody></table>
<footer><span>${stats.clases} clases · ${stats.planificadas} planificadas · ${stats.sinPlanificar} sin planificar · ${stats.hechas} hechas</span><span>Generado con Tabula</span></footer>
</body></html>`;
}

/** Imprime con un marco oculto (sin scripts en el documento). */
export function printWeek(html) {
  document.querySelectorAll('iframe.pr-print-frame').forEach((f) => f.remove());
  const frame = document.createElement('iframe');
  frame.className = 'pr-print-frame';
  frame.setAttribute('aria-hidden', 'true');
  frame.setAttribute('tabindex', '-1');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:1123px;height:794px;border:0;visibility:hidden';
  frame.addEventListener('load', () => setTimeout(() => {
    try { frame.contentWindow.focus(); frame.contentWindow.print(); } catch (e) { console.warn('No se pudo imprimir', e); }
  }, 300));
  frame.srcdoc = html;
  document.body.append(frame);
  setTimeout(() => frame.remove(), 10 * 60 * 1000);
}
