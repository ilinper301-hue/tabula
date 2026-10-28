// Tabula · acceso de asistente: lógica pura (sin DOM, sin Firebase), probada con Node.
//
// Un «apunte» llega al buzón como { tipo, datos, por, creado } y, al recogerlo, Tabula lo guarda en la
// colección local 'bandejaAsistente' para que el docente lo revise:
// bandejaAsistente { id, tipo: 'tarea'|'evento'|'observacion'|'reunion', datos (normalizados),
//                    recibidoEn: ms, dispositivo: nombre, dispositivoId, dudas: [texto],
//                    estado: 'pendiente' }   (al aceptar o descartar, el apunte sale de la bandeja)
// Lo aceptado se crea en su colección con la marca  asistente: { registradoEn, dispositivo, aceptadoEn }.

export const TIPOS = {
  tarea: 'Tarea',
  evento: 'Evento',
  observacion: 'Observación',
  reunion: 'Tutoría',
};
export const VALIDEZ_DIAS = 90;

const str = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max) : '');
const isoDate = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : null);
const hhmm = (v) => (typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : null);

/** Llave aleatoria (32 bytes en base64url, 43 caracteres). */
export function newKey(getRandomValues = (a) => crypto.getRandomValues(a)) {
  const b = getRandomValues(new Uint8Array(32));
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export const validKey = (k) => typeof k === 'string' && /^[A-Za-z0-9_-]{43}$/.test(k);

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

/**
 * Busca alumnos por lo que se escribe («Jesús», «jesus g», «García»).
 * @param grupos [{ id, nombre, alumnos: [{ id, nombre, apellidos }] }]
 * @returns [{ id, nombre, apellidos, groupId, grupo }] ordenados por parecido
 */
export function matchStudents(grupos, query) {
  const words = norm(query).split(' ').filter(Boolean);
  if (!words.length) return [];
  const out = [];
  for (const g of grupos || []) {
    for (const a of g.alumnos || []) {
      const nom = norm(a.nombre), ape = norm(a.apellidos), full = `${nom} ${ape}`;
      // «j.» es una inicial (lectura del asistente): vale cualquier palabra que empiece por esa letra
      const parts = full.split(' ');
      if (!words.every((w) => parts.some((p) => p.startsWith(w) || (/^[a-z]\.$/.test(p) && w[0] === p[0])))) continue;
      const score = (nom === words.join(' ') ? 0 : nom.startsWith(words[0]) ? 1 : 2);
      out.push({ id: a.id, nombre: a.nombre, apellidos: a.apellidos, groupId: g.id, grupo: g.nombre, score });
    }
  }
  return out.sort((x, y) => x.score - y.score || x.nombre.localeCompare(y.nombre, 'es') || x.apellidos.localeCompare(y.apellidos, 'es'));
}

/**
 * Normaliza y comprueba un apunte recibido. Nunca confía en lo que llega: solo se quedan los campos previstos,
 * recortados y con formato válido. Los alumnos se comprueban contra los grupos reales.
 * @param ctx { students: Map(id → { id, groupId, nombre, apellidos }), today }
 * @returns { ok, tipo, datos, dudas: [] }  (ok = false si el apunte no sirve)
 */
export function normalizeItem(tipo, datos, ctx) {
  const d = datos && typeof datos === 'object' ? datos : {};
  const dudas = [];
  const studentOk = (id) => (typeof id === 'string' && ctx.students.has(id) ? ctx.students.get(id) : null);
  if (tipo === 'tarea') {
    const titulo = str(d.titulo, 200);
    if (!titulo) return { ok: false };
    const fecha = d.fecha ? isoDate(d.fecha) : null;
    if (d.fecha && !fecha) dudas.push('La fecha no se entendió.');
    return { ok: true, tipo, dudas, datos: { titulo, fecha, hora: hhmm(d.hora), notas: str(d.notas, 1000) } };
  }
  if (tipo === 'evento') {
    const titulo = str(d.titulo, 200);
    const fecha = isoDate(d.fecha);
    if (!titulo || !fecha) return { ok: false };
    return { ok: true, tipo, dudas, datos: { titulo, fecha, hora: hhmm(d.hora), horaFin: hhmm(d.horaFin), notas: str(d.notas, 1000) } };
  }
  if (tipo === 'observacion') {
    const texto = str(d.texto, 2000);
    if (!texto) return { ok: false };
    const st = studentOk(d.studentId);
    if (!st) dudas.push(`Falta elegir el alumno o alumna${d.alumnoTexto ? ` («${str(d.alumnoTexto, 80)}»)` : ''}.`);
    return {
      ok: true, tipo, dudas,
      datos: {
        studentId: st ? st.id : null, groupId: st ? st.groupId : null, alumnoTexto: str(d.alumnoTexto, 80),
        tipo: ['positiva', 'negativa', 'neutra'].includes(d.tipo) ? d.tipo : 'neutra', texto,
        fecha: isoDate(d.fecha) || ctx.today,
      },
    };
  }
  if (tipo === 'reunion') {
    const fecha = isoDate(d.fecha);
    if (!fecha) return { ok: false };
    const ids = Array.isArray(d.studentIds) ? d.studentIds.slice(0, 6) : [];
    const sts = ids.map(studentOk).filter(Boolean);
    const groups = [...new Set(sts.map((s) => s.groupId))];
    if (!sts.length) dudas.push(`Falta elegir el alumno o alumna${d.alumnoTexto ? ` («${str(d.alumnoTexto, 80)}»)` : ''}.`);
    if (groups.length > 1) dudas.push('Los alumnos elegidos son de grupos distintos.');
    const acuerdos = (Array.isArray(d.acuerdos) ? d.acuerdos : []).slice(0, 20).map((a) => str(a, 300)).filter(Boolean);
    return {
      ok: true, tipo, dudas,
      datos: {
        studentIds: sts.map((s) => s.id), groupId: groups[0] || null, alumnoTexto: str(d.alumnoTexto, 80),
        fecha, hora: hhmm(d.hora), modalidad: ['presencial', 'telefono', 'video'].includes(d.modalidad) ? d.modalidad : 'presencial',
        asistentes: str(d.asistentes, 300), motivo: str(d.motivo, 500), resumen: str(d.resumen, 3000), acuerdos,
      },
    };
  }
  return { ok: false };
}

/** ¿Se puede aceptar ya? (las observaciones y reuniones necesitan alumno asignado). */
export function readyToAccept(item) {
  if (item.tipo === 'observacion') return !!item.datos.studentId;
  if (item.tipo === 'reunion') return item.datos.studentIds.length > 0 && !!item.datos.groupId;
  return true;
}

/** Iniciales de un texto: «Jesús María» → «J. M.» */
const initials = (t) => String(t || '').trim().split(/[\s-]+/).filter(Boolean).map((w) => `${w[0].toUpperCase()}.`).join(' ');

/**
 * Alumnado del grupo SOLO con iniciales («J.» + «G. M.»): el nombre completo nunca sale de Tabula.
 * Si dos coinciden en el grupo, se añade su número de lista para distinguirlos.
 */
export function initialsList(alumnos) {
  const rows = alumnos.map((s, i) => ({ id: s.id, nombre: initials(s.nombre), apellidos: initials(s.apellidos), n: i + 1 }));
  const key = (r) => `${r.nombre} ${r.apellidos}`;
  const count = new Map();
  rows.forEach((r) => count.set(key(r), (count.get(key(r)) || 0) + 1));
  return rows.map((r) => ({ id: r.id, nombre: r.nombre, apellidos: count.get(key(r)) > 1 ? `${r.apellidos} (n.º ${r.n})`.trim() : r.apellidos }));
}

/**
 * Documento de lectura para el asistente: SOLO grupos con las iniciales del alumnado, tareas pendientes y horas de eventos.
 * Nada de nombres completos, fichas, notas, medidas, contactos ni observaciones.
 */
export function buildLectura({ groups, students, tasks, events, today, dias = 60 }) {
  const lim = new Date(`${today}T00:00:00`); lim.setDate(lim.getDate() + dias);
  const limISO = `${lim.getFullYear()}-${String(lim.getMonth() + 1).padStart(2, '0')}-${String(lim.getDate()).padStart(2, '0')}`;
  const activos = groups.filter((g) => !g.archivado);
  return {
    grupos: activos.map((g) => ({
      id: g.id, nombre: g.nombre || '',
      alumnos: initialsList(students.filter((s) => s.groupId === g.id).sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))),
    })),
    pendientes: tasks.filter((t) => !t.done)
      .map((t) => ({ titulo: String(t.title || '').slice(0, 200), fecha: t.due || null, hora: t.time || null }))
      .sort((a, b) => (a.fecha || '9999').localeCompare(b.fecha || '9999')).slice(0, 200),
    eventos: events.filter((e) => e.fecha && e.fecha <= limISO && (e.fechaFin || e.fecha) >= today)
      .map((e) => ({ titulo: String(e.titulo || '').slice(0, 200), fecha: e.fecha, fechaFin: e.fechaFin || null, hora: e.hora || null, tipo: e.tipo || 'otro' }))
      .sort((a, b) => (a.fecha + (a.hora || '')).localeCompare(b.fecha + (b.hora || ''))).slice(0, 300),
  };
}

/** Solapamientos: eventos con hora el mismo día a menos de `margen` minutos. */
export function overlaps(eventos, fecha, hora, margen = 45) {
  if (!fecha || !hora) return [];
  const m = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  return (eventos || []).filter((e) => e.fecha === fecha && e.hora && Math.abs(m(e.hora) - m(hora)) < margen);
}

/** Registros que se crean al aceptar un apunte (marcados como del asistente). */
export function toRecords(item, now = Date.now(), today = null) {
  const hoy = today || (() => { const t = new Date(now); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; })();
  const marca = { asistente: { registradoEn: item.recibidoEn || now, dispositivo: item.dispositivo || '', aceptadoEn: now } };
  const d = item.datos;
  if (item.tipo === 'tarea') {
    return { tasks: [{ title: d.titulo, notes: d.notas || '', due: d.fecha || null, time: d.hora || null, priority: 0, tags: [], subtasks: [], done: false, doneAt: null, ...marca }] };
  }
  if (item.tipo === 'evento') {
    const notas = [d.notas, d.horaFin ? `Hasta las ${d.horaFin}` : ''].filter(Boolean).join('\n');
    return { events: [{ titulo: d.titulo, fecha: d.fecha, fechaFin: null, hora: d.hora || null, tipo: 'otro', groupId: null, notas, ...marca }] };
  }
  if (item.tipo === 'observacion') {
    return { observaciones: [{ studentId: d.studentId, groupId: d.groupId, fecha: d.fecha, hora: '', tipo: d.tipo || 'neutra', etiqueta: null, texto: d.texto, area: null, sesionId: null, ...marca }] };
  }
  if (item.tipo === 'reunion') {
    return {
      reuniones: [{
        groupId: d.groupId, studentIds: d.studentIds, fecha: d.fecha, hora: d.hora || null, tipo: 'familia', modalidad: d.modalidad || 'presencial',
        iniciativa: 'tutor', asistentes: d.asistentes || '', motivo: d.motivo || '', resumen: d.resumen || '',
        acuerdos: (d.acuerdos || []).map((texto, i) => ({ id: `a${now.toString(36)}${i}`, texto, hecho: false })),
        estado: d.fecha <= hoy || d.resumen || (d.acuerdos || []).length ? 'realizada' : 'prevista', eventId: null, ...marca,
      }],
    };
  }
  return {};
}
