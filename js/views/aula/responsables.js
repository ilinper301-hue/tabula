// Tabula · En clase · Responsables de la semana (reparto rotativo)
import { store } from '../../store.js';
import { h, openSheet, toast, todayISO } from '../../ui.js';
import { getStudents, initials } from '../../school.js';
import { mondayOf, addDays, shortDate, svg } from './common.js';

export const DEFAULT_ROLES = ['Encargado/a de la luz', 'Reparte material', 'Encargado/a de la fila', 'Ayudante del día', 'Pizarra'];
const key = (gid) => `aula:responsables:${gid}`;

export function loadResp(gid) {
  const v = store.getSetting(key(gid), null) || {};
  return { roles: Array.isArray(v.roles) && v.roles.length ? v.roles : [...DEFAULT_ROLES], semanas: v.semanas && typeof v.semanas === 'object' ? v.semanas : {} };
}
const saveResp = (gid, data) => store.setSetting(key(gid), data);

/**
 * Reparte los roles de una semana de forma justa: a cada rol le toca quien menos veces lo ha tenido,
 * quien menos responsabilidades suma y quien hace más tiempo que no tiene ninguna.
 * Función pura (exportada para las pruebas).
 */
export function assignWeek(roles, semanas, week, studentIds, rnd = Math.random) {
  const total = new Map(studentIds.map((id) => [id, 0])); const byRole = new Map(); const last = new Map();
  Object.keys(semanas).filter((w) => w !== week).sort().forEach((w) => {
    for (const [role, sid] of Object.entries(semanas[w] || {})) {
      if (!total.has(sid)) continue;
      total.set(sid, total.get(sid) + 1);
      const k = `${sid}|${role}`; byRole.set(k, (byRole.get(k) || 0) + 1);
      last.set(sid, w);
    }
  });
  const used = new Set(); const out = {};
  for (const role of roles) {
    let cands = studentIds.filter((id) => !used.has(id));
    if (!cands.length) cands = [...studentIds];
    const rows = cands.map((id) => ({ id, t: total.get(id), r: byRole.get(`${id}|${role}`) || 0, l: last.get(id) || '', x: rnd() }));
    rows.sort((a, b) => a.t - b.t || a.r - b.r || a.l.localeCompare(b.l) || a.x - b.x);
    if (rows[0]) { out[role] = rows[0].id; used.add(rows[0].id); }
  }
  return out;
}

export function create(ctx) {
  let week = mondayOf(todayISO());
  const thisWeek = () => mondayOf(todayISO());

  const label = h('div', { class: 'au-week-label', 'aria-live': 'polite' });
  const prev = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Semana anterior', onclick: () => { week = addDays(week, -7); paint(); } }, '‹');
  const next = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Semana siguiente', onclick: () => { week = addDays(week, 7); paint(); } }, '›');
  const nowBtn = h('button', { type: 'button', class: 'btn btn-sm btn-ghost', onclick: () => { week = thisWeek(); paint(); } }, 'Esta semana');
  const repartir = h('button', { type: 'button', class: 'btn btn-primary au-big-btn', onclick: () => doRepartir() }, svg('shuffle', 20), 'Repartir');
  const editar = h('button', { type: 'button', class: 'btn au-big-btn', onclick: () => editRoles() }, 'Editar responsabilidades');
  const grid = h('div', { class: 'au-roles' });
  const hint = h('p', { class: 'au-sub' }, 'Cada semana el reparto rota: les toca primero a quienes menos veces han tenido cada responsabilidad.');
  const el = h('div', { class: 'au-resp' },
    h('div', { class: 'au-week' }, prev, label, next, nowBtn),
    h('div', { class: 'au-actions' }, repartir, editar), grid, hint);

  const gid = () => ctx.groupId();

  function paint() {
    const data = loadResp(gid()); const students = getStudents(gid()); const byId = Object.fromEntries(students.map((s) => [s.id, s]));
    const cur = week === thisWeek();
    label.replaceChildren(h('strong', {}, `Semana del ${shortDate(week)}`), h('span', { class: 'au-sub' }, cur ? 'Esta semana' : week < thisWeek() ? 'Semana pasada' : 'Próxima semana'));
    nowBtn.hidden = cur;
    repartir.disabled = !students.length;
    const asg = data.semanas[week] || {};
    grid.replaceChildren(...data.roles.map((role) => {
      const s = byId[asg[role]];
      return h('button', { type: 'button', class: `au-role${s ? '' : ' is-empty'}`, 'data-role': role, 'aria-label': `${role}: ${s ? s.nombre : 'sin asignar'}. Cambiar`, onclick: () => pick(role) },
        h('span', { class: 'au-role-name' }, role),
        h('span', { class: 'au-role-who' }, h('span', { class: 'au-ini au-ini-lg', 'aria-hidden': 'true' }, s ? initials(s) : '?'),
          h('span', { class: 'au-role-pupil' }, s ? s.nombre : 'Sin asignar', s && s.apellidos ? h('small', {}, s.apellidos) : null)),
        h('span', { class: 'au-role-swap', 'aria-hidden': 'true' }, svg('swap', 18)));
    }));
  }

  function doRepartir() {
    const g = gid(); const data = loadResp(g); const ids = getStudents(g).map((s) => s.id);
    const before = data.semanas[week];
    data.semanas = { ...data.semanas, [week]: assignWeek(data.roles, data.semanas, week, ids) };
    saveResp(g, data); paint();
    toast('Responsables repartidos', { label: 'Deshacer', run: () => { const d = loadResp(g); const s = { ...d.semanas }; if (before) s[week] = before; else delete s[week]; saveResp(g, { ...d, semanas: s }); paint(); } });
  }

  function pick(role) {
    const g = gid(); const students = getStudents(g); const data = loadResp(g);
    const asg = data.semanas[week] || {};
    const holder = Object.fromEntries(Object.entries(asg).map(([r, sid]) => [sid, r]));
    const apply = (sid) => {
      const d = loadResp(g); const wk = { ...(d.semanas[week] || {}) };
      const old = wk[role];
      if (sid) {
        const other = Object.keys(wk).find((r) => r !== role && wk[r] === sid);
        if (other) { if (old) wk[other] = old; else delete wk[other]; }   // intercambio
        wk[role] = sid;
      } else delete wk[role];
      saveResp(g, { ...d, semanas: { ...d.semanas, [week]: wk } });
      close(); paint();
    };
    const list = h('div', { class: 'au-pick-list', role: 'listbox', 'aria-label': `Quién será ${role}` },
      ...students.map((s) => h('button', { type: 'button', class: `au-pick${asg[role] === s.id ? ' is-on' : ''}`, role: 'option', 'aria-selected': String(asg[role] === s.id), onclick: () => apply(s.id) },
        h('span', { class: 'au-ini', 'aria-hidden': 'true' }, initials(s)),
        h('span', { class: 'au-pick-name' }, `${s.nombre} ${s.apellidos || ''}`.trim()),
        holder[s.id] && holder[s.id] !== role ? h('span', { class: 'chip t2' }, holder[s.id]) : null)));
    const body = h('div', {}, h('p', { class: 'au-sub' }, 'Si ya tiene otra responsabilidad esta semana, se intercambian.'), list,
      asg[role] ? h('button', { type: 'button', class: 'btn btn-ghost au-clear', onclick: () => apply(null) }, 'Dejar sin asignar') : null);
    const close = openSheet(role, body);
  }

  function editRoles() {
    const g = gid(); const data = loadResp(g);
    let rows = data.roles.map((r) => ({ orig: r, name: r }));
    const host = h('div', { class: 'au-roles-edit' });
    const draw = () => host.replaceChildren(...rows.map((r, i) => h('div', { class: 'au-role-row' },
      h('input', { class: 'input', value: r.name, 'aria-label': `Responsabilidad ${i + 1}`, maxlength: 40, oninput: (e) => { r.name = e.target.value; } }),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Quitar ${r.name}`, onclick: () => { rows.splice(i, 1); draw(); } }, '×'))));
    draw();
    const body = h('div', {}, host,
      h('div', { class: 'au-actions' },
        h('button', { type: 'button', class: 'btn', onclick: () => { rows.push({ orig: null, name: '' }); draw(); host.querySelector('.au-role-row:last-child input').focus(); } }, '+ Añadir'),
        h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => { rows = DEFAULT_ROLES.map((r) => ({ orig: r, name: r })); draw(); } }, 'Restaurar')),
      h('div', { class: 'au-actions au-end' },
        h('button', { type: 'button', class: 'btn btn-primary', onclick: () => {
          const clean = rows.map((r) => ({ ...r, name: r.name.trim() })).filter((r) => r.name);
          const seen = new Set(); const uniq = clean.filter((r) => (seen.has(r.name) ? false : seen.add(r.name)));
          if (!uniq.length) { toast('Añade al menos una responsabilidad'); return; }
          const d = loadResp(g); const semanas = {};
          for (const [w, m] of Object.entries(d.semanas)) {
            const nm = {};
            for (const r of uniq) if (r.orig && m[r.orig]) nm[r.name] = m[r.orig];
            semanas[w] = nm;
          }
          saveResp(g, { roles: uniq.map((r) => r.name), semanas }); close(); paint();
        } }, 'Guardar')));
    const close = openSheet('Responsabilidades', body);
  }

  paint();
  return { el, setGroup() { week = thisWeek(); paint(); }, refresh() { paint(); }, destroy() {} };
}
