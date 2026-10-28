// Tabula · «Mañana falto»: plan para el sustituto (datos y documento A4; sin interfaz).
// La hoja de edición está en views/sustituto.js. Aquí solo hay lógica: reunir lo que hay en el horario,
// la planificación y el grupo, y generar el HTML imprimible (todo el texto del usuario va escapado).
//
// AJUSTES (store.setSetting)
//   sustituto:normas:${groupId}  texto con las normas y rutinas de clase (una por línea)
//   sustituto:contacto           contacto del centro / persona de referencia
//   sustituto:medidas            true|false: incluir «Necesita apoyo» (por defecto true)

import { store } from './store.js';
import { getSessionsForDate, getEventsForDate, getGroup, getStudents, listName, fullName, areaShort, sessionLabel, EVENT_TYPES } from './school.js';
import { isLectivo } from './planning.js';
import { addDaysISO, fromISO, DIAS, MESES } from './ui.js';
import { kindOf, canPrint } from './documents.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const multiline = (s) => esc(s).replace(/\r?\n/g, '<br>');
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export const NORMAS_DEFAULT = [
  'Entrada: el alumnado entra en fila, cuelga la mochila y se sienta en su sitio.',
  'Baño: de uno en uno, con permiso, y no en los primeros ni en los últimos minutos de clase.',
  'Material: cada niño y niña tiene el suyo; si falta algo, se presta del aula.',
  'Fila: se forma en silencio y por orden, para ir al patio o a otras aulas.',
  'Recreo: sale toda la clase junta; antes se bebe agua y se va al baño.',
  'Salida: en fila, y cada niño o niña se entrega solo a su familia o a la persona autorizada.',
].join('\n');

export const normasKey = (groupId) => `sustituto:normas:${groupId}`;
export const getNormas = (groupId) => store.getSetting(normasKey(groupId), null) ?? NORMAS_DEFAULT;

// ---------- Fechas ----------
export const dayName = (iso) => DIAS[fromISO(iso).getDay()];
/** "jueves, 29 de octubre de 2026" */
export const longDateEs = (iso) => { const d = fromISO(iso); return `${DIAS[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`; };
/** "Jueves 29 de octubre" */
export const dayHeading = (iso) => { const d = fromISO(iso); return `${cap(DIAS[d.getDay()])} ${d.getDate()} de ${MESES[d.getMonth()]}`; };
/** "jue 29 oct" */
export const shortDay = (iso) => { const d = fromISO(iso); return `${DIAS[d.getDay()].slice(0, 3)} ${d.getDate()} ${MESES[d.getMonth()].slice(0, 3)}`; };
export const mondayOf = (iso) => { const d = fromISO(iso); return addDaysISO(iso, -((d.getDay() + 6) % 7)); };

/** Los próximos `n` días lectivos desde `startIso` (incluido si es lectivo). */
export function schoolDays(startIso, n = 1, events = store.list('events')) {
  const out = [];
  let d = startIso;
  for (let i = 0; i < 400 && out.length < n; i++, d = addDaysISO(d, 1)) if (isLectivo(d, events)) out.push(d);
  return out;
}
/** Primer día lectivo posterior a `fromIso`. */
export const nextSchoolDay = (fromIso, events = store.list('events')) => schoolDays(addDaysISO(fromIso, 1), 1, events)[0] || addDaysISO(fromIso, 1);

/** Título del documento: «Plan para el sustituto · jue 29 oct» (o «jue 29 oct – lun 2 nov»). */
export function planTitle(dates) {
  const a = shortDay(dates[0]), b = dates.length > 1 ? shortDay(dates[dates.length - 1]) : '';
  return `Plan para el sustituto · ${b && b !== a ? `${a} – ${b}` : a}`;
}

// ---------- Reunir los datos de un día ----------
/** Une franjas seguidas de la misma actividad (como en Hoy). */
function mergeBlocks(sessions) {
  const blocks = [];
  for (const s of sessions) {
    const last = blocks[blocks.length - 1];
    const same = last && last.fin === s.inicio && last.tipo === s.tipo && (last.area || '') === (s.area || '')
      && (last.groupId || null) === (s.groupId || null) && (last.titulo || '') === (s.titulo || '') && (last.aula || '') === (s.aula || '');
    if (same) { last.fin = s.fin; last.parts.push(s); } else blocks.push({ ...s, parts: [s] });
  }
  return blocks;
}

/** Apoyos del bloque: "Pili" si cubre todo, "Pili (9:00–9:30)" si solo una parte. */
function apoyosOf(parts) {
  return [...new Set(parts.map((p) => p.apoyo).filter(Boolean))].map((name) => {
    const w = parts.filter((p) => p.apoyo === name);
    return w.length === parts.length ? name : `${name} (${w[0].inicio}–${w[w.length - 1].fin})`;
  });
}

/**
 * Plan de un día: franjas del horario con su sesión planificada y los documentos adjuntos.
 * Devuelve objetos editables (`que`, `incluir`, `docs[].incluir`).
 */
export function gatherDay(iso) {
  const planned = store.list('sesiones').filter((x) => x.fecha === iso);
  const docs = Object.fromEntries(store.list('documentos').map((d) => [d.id, d]));
  const slots = mergeBlocks(getSessionsForDate(iso)).map((b) => {
    const isClass = b.tipo === 'clase';
    const group = isClass ? getGroup(b.groupId) : null;
    const ses = isClass ? planned.filter((x) => b.parts.some((p) => p.id === x.scheduleId)).sort((a, c) => (a.orden ?? 0) - (c.orden ?? 0)) : [];
    const docIds = [...new Set(ses.flatMap((x) => x.documentoIds || []))].filter((id) => docs[id]);
    return {
      key: `${iso}|${b.id}`, inicio: b.inicio, fin: b.fin, tipo: b.tipo,
      area: b.area || '', titulo: isClass ? (areaShort(b.area) || 'Clase') : sessionLabel(b),
      groupId: group ? group.id : null, groupName: group ? group.nombre : '', aula: b.aula || '', apoyos: apoyosOf(b.parts),
      sesiones: ses.map((x) => ({ id: x.id, titulo: x.titulo || '' })),
      que: ses.map((x) => [x.titulo, x.desarrollo].map((t) => (t || '').trim()).filter(Boolean).join('\n')).filter(Boolean).join('\n'),
      objetivo: ses.map((x) => (x.objetivo || '').trim()).filter(Boolean).join(' · '),
      materiales: ses.map((x) => (x.materiales || '').trim()).filter(Boolean).join(' · '),
      docs: docIds.map((id) => ({ id, titulo: docs[id].titulo || 'Documento', incluir: true, imprimible: canPrint(docs[id]), tipo: kindOf(docs[id]) })),
      incluir: true,
    };
  });
  const eventos = getEventsForDate(iso).filter((e) => e.tipo !== 'nolectivo')
    .map((e) => ({ titulo: e.titulo || (EVENT_TYPES[e.tipo] || EVENT_TYPES.otro).label, hora: e.hora || '', tipo: e.tipo }));
  return { fecha: iso, nolectivo: !isLectivo(iso, store.list('events')), eventos, slots };
}

/** Alumnado con medida activa (medidas de Tutoría o campo «medidas» del alumno): solo para saber QUIÉN, nunca qué. */
export function studentsWithMeasures(groupId) {
  const students = getStudents(groupId);
  const ids = new Set(store.list('medidas').filter((m) => m.estado === 'activa').map((m) => m.studentId));
  return students.filter((s) => ids.has(s.id) || (s.medidas || '').trim());
}

/** Datos del grupo para el plan: alumnado, responsables de la semana, alumnado con apoyo y normas. */
export function gatherGroup(groupId, fechas) {
  const g = getGroup(groupId);
  if (!g) return null;
  const students = getStudents(groupId);
  const r = store.getSetting(`aula:responsables:${groupId}`, null) || {};
  const week = (r.semanas && r.semanas[mondayOf(fechas[0])]) || {};
  const roles = Array.isArray(r.roles) && r.roles.length ? r.roles : Object.keys(week);
  const responsables = roles.filter((rol) => week[rol]).map((rol) => ({ rol, nombre: (students.find((s) => s.id === week[rol]) || {}).nombre || '' })).filter((x) => x.nombre);
  return {
    id: g.id, nombre: g.nombre,
    alumnos: students.map((s) => ({ id: s.id, nombre: listName(s) })),
    responsables,
    apoyo: studentsWithMeasures(groupId).map((s) => fullName(s)),
    normas: getNormas(groupId),
  };
}

// ---------- Documento imprimible (A4) ----------
const CSS = `
@page { size: A4; margin: 16mm 18mm 18mm; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body { font: 10.5pt/1.5 system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1c1b19; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
h1, h2 { font-family: 'Source Serif 4', Georgia, 'Times New Roman', serif; font-weight: 500; }
.top { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; border-bottom: 1.5px solid #3E5C76; padding-bottom: 6px; font-size: 9.5pt; color: #55544f; }
.top strong { color: #3E5C76; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; font-size: 8.5pt; }
h1 { font-size: 24pt; margin: 16px 0 2px; letter-spacing: -.01em; line-height: 1.1; }
.sub { color: #66655f; margin: 0 0 12px; font-size: 11.5pt; }
.meta { display: flex; flex-wrap: wrap; gap: 6px 26px; padding: 10px 0; border-top: 1px solid #ddd9cd; border-bottom: 1px solid #ddd9cd; margin: 0 0 6px; }
.meta div { min-width: 0; }
.meta dt { font-size: 7.5pt; text-transform: uppercase; letter-spacing: .09em; color: #77766f; margin: 0; }
.meta dd { margin: 0; font-weight: 600; }
h2 { font-size: 14pt; margin: 20px 0 7px; color: #3E5C76; break-after: avoid; }
h2 small { font-family: system-ui, sans-serif; font-size: 9pt; font-weight: 400; color: #77766f; margin-left: 6px; }
.contact { margin: 12px 0 0; padding: 9px 14px; border: 1px solid #c9d6e2; background: #EDF2F6; border-radius: 8px; break-inside: avoid; }
.contact b { display: block; font-size: 7.5pt; text-transform: uppercase; letter-spacing: .09em; color: #3E5C76; }
.events { margin: 6px 0 8px; padding: 7px 12px; border-left: 3px solid #AE5630; background: #FBF1EB; border-radius: 0 6px 6px 0; font-size: 10pt; break-inside: avoid; }
.slot { display: grid; grid-template-columns: 22mm 1fr; gap: 0 12px; padding: 9px 0; border-bottom: 1px solid #ece9e0; break-inside: avoid; }
.slot .time { font-variant-numeric: tabular-nums; font-weight: 600; color: #3E5C76; line-height: 1.25; }
.slot .time span { display: block; font-weight: 400; color: #99978e; font-size: 9pt; }
.st { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 8px; }
.st strong { font-size: 12pt; }
.tag { font-size: 8.5pt; padding: 1px 7px; border-radius: 5px; background: #EDF2F6; color: #34495E; white-space: nowrap; }
.tag.ap { background: #F3EEF6; color: #5B4469; }
.que { margin: 4px 0 0; }
.rl { height: 7.5mm; border-bottom: 1px dotted #b9b6aa; }
.info { margin: 3px 0 0; font-size: 9.5pt; color: #55544f; }
.info b { color: #3d3c38; font-weight: 600; }
.brk { display: grid; grid-template-columns: 22mm 1fr; gap: 0 12px; padding: 6px 0; border-bottom: 1px solid #ece9e0; color: #66655f; font-size: 9.5pt; break-inside: avoid; }
.brk .time { font-variant-numeric: tabular-nums; color: #99978e; font-size: 9pt; white-space: nowrap; }
.brk strong { font-weight: 600; color: #55544f; }
.empty { color: #77766f; font-style: italic; margin: 8px 0; }
table.lista { width: 100%; border-collapse: collapse; margin-top: 4px; }
table.lista th { text-align: left; font-size: 7.5pt; text-transform: uppercase; letter-spacing: .08em; color: #77766f; font-weight: 600; padding: 3px 6px; border-bottom: 1.5px solid #3E5C76; }
table.lista th.d { text-align: center; width: 20mm; }
table.lista td { padding: 3px 6px; border-bottom: 1px solid #ece9e0; font-size: 10pt; }
table.lista td.n { width: 9mm; color: #99978e; font-variant-numeric: tabular-nums; }
table.lista td.d { width: 20mm; border-left: 1px solid #ece9e0; }
table.lista tr { break-inside: avoid; }
.resp { display: flex; flex-wrap: wrap; gap: 5px 8px; margin: 2px 0 6px; font-size: 9.5pt; }
.resp span { padding: 2px 9px; background: #EEF2EA; color: #435536; border-radius: 99px; }
.apoyo { margin-top: 12px; padding: 9px 14px; border: 1px solid #DDCFE5; background: #F8F4FA; border-radius: 8px; break-inside: avoid; }
.apoyo ul { list-style: none; padding: 0; margin: 4px 0 0; }
.apoyo li { padding: 2px 0; }
.apoyo li b { font-weight: 600; }
.apoyo li span { color: #66655f; }
ul.normas { list-style: none; margin: 0; padding: 0; }
ul.normas li { padding: 5px 0; border-bottom: 1px solid #ece9e0; break-inside: avoid; }
ul.normas li b { color: #3E5C76; font-weight: 600; }
.notes { break-inside: avoid; }
.notes p { color: #77766f; margin: 0 0 4px; font-size: 9.5pt; }
.notes .rl { height: 9mm; border-bottom: 1px solid #cfccc0; }
.foot { margin-top: 16px; font-size: 8pt; color: #99978e; text-align: right; }
`;

/** Normas: «Entrada: texto» → negrita en el título si es corto. */
function normasHTML(text) {
  const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return '<p class="empty">Sin normas indicadas.</p>';
  return `<ul class="normas">${lines.map((l) => {
    const m = /^([^:]{1,24}):\s*(.+)$/.exec(l);
    return `<li>${m ? `<b>${esc(m[1])}:</b> ${esc(m[2])}` : esc(l)}</li>`;
  }).join('')}</ul>`;
}

function slotHTML(s) {
  if (s.tipo !== 'clase') {
    return `<div class="brk"><div class="time">${esc(s.inicio)}–${esc(s.fin)}</div><div><strong>${esc(s.titulo)}</strong>${s.aula ? ` · ${esc(s.aula)}` : ''}${s.apoyos.length ? ` · Apoyo: ${esc(s.apoyos.join(', '))}` : ''}</div></div>`;
  }
  const docs = s.docs.filter((d) => d.incluir);
  const que = String(s.que || '').trim();
  return `<section class="slot"><div class="time">${esc(s.inicio)}<span>${esc(s.fin)}</span></div><div>
    <div class="st"><strong>${esc(s.titulo)}</strong>${s.groupName ? `<span class="tag">${esc(s.groupName)}</span>` : ''}${s.aula ? `<span class="tag">${esc(s.aula)}</span>` : ''}${s.apoyos.length ? `<span class="tag ap">Apoyo: ${esc(s.apoyos.join(', '))}</span>` : ''}</div>
    ${que ? `<div class="que">${multiline(que)}</div>` : '<div class="rl"></div><div class="rl"></div>'}
    ${s.objetivo ? `<p class="info"><b>Objetivo:</b> ${esc(s.objetivo)}</p>` : ''}
    ${s.materiales ? `<p class="info"><b>Materiales:</b> ${esc(s.materiales)}</p>` : ''}
    ${docs.length ? `<p class="info"><b>Para imprimir o repartir:</b> ${esc(docs.map((d) => d.titulo).join(' · '))}</p>` : ''}
  </div></section>`;
}

/**
 * HTML completo del plan.
 * @param plan { days: gatherDay()[] (con las ediciones), groups: gatherGroup()[], contacto: string, incluirMedidas: boolean }
 * @param profile { nombre, centro }
 */
export function buildPlanHTML(plan, profile = {}) {
  const days = plan.days || [];
  const dates = days.map((d) => d.fecha);
  const many = days.length > 1;
  const groups = plan.groups || [];
  const meta = [
    profile.nombre ? ['Docente', profile.nombre] : null,
    groups.length ? [groups.length > 1 ? 'Grupos' : 'Grupo', groups.map((g) => g.nombre).join(', ')] : null,
    ['Fecha', many ? `${shortDay(dates[0])} – ${shortDay(dates[dates.length - 1])}` : longDateEs(dates[0])],
  ].filter(Boolean);

  const daysHTML = days.map((d) => {
    const slots = d.slots.filter((s) => s.incluir);
    return `<section>
      <h2>${many ? esc(dayHeading(d.fecha)) : 'Horario del día'}</h2>
      ${d.eventos.length ? `<div class="events"><b>Ese día:</b> ${esc(d.eventos.map((e) => (e.hora ? `${e.hora} ${e.titulo}` : e.titulo)).join(' · '))}</div>` : ''}
      ${slots.length ? slots.map(slotHTML).join('') : '<p class="empty">No hay sesiones en el horario de este día.</p>'}
    </section>`;
  }).join('');

  const groupsHTML = groups.map((g) => {
    const apoyo = plan.incluirMedidas ? (g.apoyo || []) : [];
    return `<section>
      <h2>Alumnado<small>${esc(g.nombre)} · ${g.alumnos.length} ${g.alumnos.length === 1 ? 'alumno/a' : 'alumnos/as'}</small></h2>
      ${g.responsables.length ? `<div class="resp">${g.responsables.map((r) => `<span><b>${esc(r.rol)}:</b> ${esc(r.nombre)}</span>`).join('')}</div>` : ''}
      ${g.alumnos.length ? `<table class="lista"><thead><tr><th>Nº</th><th>Para pasar lista</th>${days.map((d) => `<th class="d">${esc(shortDay(d.fecha))}</th>`).join('')}</tr></thead>
        <tbody>${g.alumnos.map((a, i) => `<tr><td class="n">${i + 1}</td><td>${esc(a.nombre)}</td>${days.map(() => '<td class="d"></td>').join('')}</tr>`).join('')}</tbody></table>` : '<p class="empty">Este grupo aún no tiene alumnado.</p>'}
      ${apoyo.length ? `<div class="apoyo"><b>Alumnado que necesita apoyo</b><ul>${apoyo.map((n) => `<li><b>Necesita apoyo: ${esc(n)}</b> <span>— consultar con el equipo de orientación / tutor</span></li>`).join('')}</ul></div>` : ''}
      <h2>Normas y rutinas<small>${esc(g.nombre)}</small></h2>
      ${normasHTML(g.normas)}
    </section>`;
  }).join('');

  const body = `
  <div class="top"><strong>Plan para el sustituto</strong><span>${esc(profile.centro || '')}</span></div>
  <h1>${many ? 'Plan de varios días' : esc(cap(dayName(dates[0])))}</h1>
  <p class="sub">${many ? esc(`${longDateEs(dates[0])} → ${longDateEs(dates[dates.length - 1])}`) : esc(longDateEs(dates[0]))}</p>
  <dl class="meta">${meta.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
  ${String(plan.contacto || '').trim() ? `<div class="contact"><b>Contacto del centro</b>${multiline(plan.contacto.trim())}</div>` : ''}
  ${daysHTML}
  ${groupsHTML}
  <section class="notes"><h2>Notas para mí</h2><p>Qué se ha hecho, qué ha quedado pendiente, incidencias y alumnado que ha necesitado ayuda.</p>${'<div class="rl"></div>'.repeat(6)}</section>
  <p class="foot">Documento de uso interno del centro · generado con Tabula</p>`;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(planTitle(dates))}</title><style>${CSS}</style></head><body>${body}</body></html>`;
}
