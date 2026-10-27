// Tabula · Tutoría: reuniones con familias y atención a la diversidad (lógica pura).
//
// reuniones { id, groupId, studentIds: [], fecha:'YYYY-MM-DD', hora:'HH:MM'|null,
//             tipo: 'familia' | 'equipo' | 'orientacion' | 'otra', modalidad: 'presencial' | 'telefono' | 'video',
//             iniciativa: 'tutor' | 'familia' | 'centro', asistentes: '', motivo: '', resumen: '',
//             acuerdos: [{ id, texto, hecho: boolean, fecha?: 'YYYY-MM-DD' }],
//             estado: 'prevista' | 'realizada' | 'cancelada', seguimiento?: 'YYYY-MM-DD', eventId?: string }
// medidas   { id, groupId, studentId, tipo: clave de MEDIDAS, detalle: '', areas: [],
//             profesional: '' (PT, AL, refuerzo…), horario: '' (texto o resumen del horario de apoyo),
//             inicio, fin?, revision?, estado: 'activa' | 'finalizada',
//             seguimiento: [{ id, fecha, texto, valoracion?: 'positiva'|'regular'|'negativa' }] }
// Son datos personales del alumnado: se guardan como el resto (dispositivo + cuenta del docente).

export const TIPOS_REUNION = {
  familia: 'Tutoría con la familia',
  equipo: 'Equipo docente',
  orientacion: 'Con orientación (EOE)',
  otra: 'Otra',
};
export const MODALIDADES = { presencial: 'Presencial', telefono: 'Teléfono', video: 'Videollamada' };
export const INICIATIVA = { tutor: 'Del tutor/a', familia: 'De la familia', centro: 'Del centro' };
export const ESTADOS_REUNION = { prevista: 'Prevista', realizada: 'Realizada', cancelada: 'Cancelada' };

/** Medidas de atención a la diversidad (terminología de Andalucía, Orden de 30 de mayo de 2023). */
export const MEDIDAS = {
  // Generales
  refuerzo: { label: 'Refuerzo en el aula (segundo docente)', grupo: 'general' },
  agrupamiento: { label: 'Agrupamiento flexible / desdoble', grupo: 'general' },
  pra: { label: 'Programa de refuerzo del aprendizaje', grupo: 'general' },
  profundizacion: { label: 'Programa de profundización', grupo: 'general' },
  accion_tutorial: { label: 'Seguimiento tutorial', grupo: 'general' },
  // Específicas (alumnado NEAE)
  pt: { label: 'Apoyo de Pedagogía Terapéutica (PT)', grupo: 'especifica' },
  al: { label: 'Apoyo de Audición y Lenguaje (AL)', grupo: 'especifica' },
  pe: { label: 'Programa específico (PE)', grupo: 'especifica' },
  acs: { label: 'Adaptación curricular significativa (ACS)', grupo: 'especifica' },
  aac: { label: 'Adaptación de acceso (AAC)', grupo: 'especifica' },
  acai: { label: 'Adaptación para altas capacidades (ACAI)', grupo: 'especifica' },
  flexibilizacion: { label: 'Flexibilización del periodo de escolarización', grupo: 'especifica' },
  ate: { label: 'Apoyo de monitor/a o PTIS', grupo: 'especifica' },
  otra: { label: 'Otra medida', grupo: 'general' },
};
export const GRUPOS_MEDIDA = { general: 'Medidas generales', especifica: 'Medidas específicas' };

const byDateAsc = (a, b) => (a.fecha || '').localeCompare(b.fecha || '') || (a.hora || '').localeCompare(b.hora || '');

/** Reuniones próximas (desde hoy, previstas) y pasadas, ordenadas. */
export function splitReuniones(reuniones, today) {
  const proximas = reuniones.filter((r) => r.estado === 'prevista' && (r.fecha || '') >= today).sort(byDateAsc);
  const sinCerrar = reuniones.filter((r) => r.estado === 'prevista' && r.fecha && r.fecha < today).sort(byDateAsc);
  const pasadas = reuniones.filter((r) => r.estado !== 'prevista').sort((a, b) => byDateAsc(b, a));
  return { proximas, sinCerrar, pasadas };
}

/** Acuerdos sin cumplir de todas las reuniones realizadas: [{ reunion, acuerdo }] */
export function pendingAgreements(reuniones) {
  const out = [];
  for (const r of reuniones) {
    if (r.estado !== 'realizada') continue;
    for (const a of r.acuerdos || []) if (!a.hecho) out.push({ reunion: r, acuerdo: a });
  }
  return out.sort((x, y) => (x.acuerdo.fecha || x.reunion.fecha || '').localeCompare(y.acuerdo.fecha || y.reunion.fecha || ''));
}

/**
 * Seguimiento de familias del grupo en el curso: alumnado con y sin tutoría realizada.
 * @returns { con: [{ student, n, ultima }], sin: [student], cobertura: 0..1 }
 */
export function familyCoverage(students, reuniones) {
  const stats = new Map(students.map((s) => [s.id, { student: s, n: 0, ultima: null }]));
  for (const r of reuniones) {
    if (r.tipo !== 'familia' || r.estado !== 'realizada') continue;
    for (const sid of r.studentIds || []) {
      const st = stats.get(sid);
      if (!st) continue;
      st.n++;
      if (!st.ultima || r.fecha > st.ultima) st.ultima = r.fecha;
    }
  }
  const all = [...stats.values()];
  const con = all.filter((x) => x.n > 0);
  const sin = all.filter((x) => x.n === 0).map((x) => x.student);
  return { con, sin, cobertura: students.length ? con.length / students.length : 0 };
}

/** Historial de un alumno: reuniones (desc) y medidas (activas primero). */
export function studentFile(studentId, reuniones, medidas) {
  return {
    reuniones: reuniones.filter((r) => (r.studentIds || []).includes(studentId)).sort((a, b) => byDateAsc(b, a)),
    medidas: medidas.filter((m) => m.studentId === studentId)
      .sort((a, b) => (a.estado === 'activa' ? 0 : 1) - (b.estado === 'activa' ? 0 : 1) || (b.inicio || '').localeCompare(a.inicio || '')),
  };
}

/** Medidas activas cuya revisión toca ya (fecha de revisión ≤ hoy + margen). */
export function reviewsDue(medidas, today, marginDays = 7) {
  const [y, m, d] = today.split('-').map(Number);
  const lim = new Date(y, m - 1, d + marginDays);
  const limISO = `${lim.getFullYear()}-${String(lim.getMonth() + 1).padStart(2, '0')}-${String(lim.getDate()).padStart(2, '0')}`;
  return medidas.filter((x) => x.estado === 'activa' && x.revision && x.revision <= limISO).sort((a, b) => a.revision.localeCompare(b.revision));
}

/** Resumen del grupo para el informe/memoria: nº de alumnos por tipo de medida activa. */
export function measuresSummary(medidas) {
  const out = {};
  for (const m of medidas) {
    if (m.estado !== 'activa') continue;
    (out[m.tipo] ||= new Set()).add(m.studentId);
  }
  return Object.entries(out).map(([tipo, set]) => ({ tipo, label: MEDIDAS[tipo]?.label || tipo, alumnos: set.size }))
    .sort((a, b) => b.alumnos - a.alumnos);
}

/** Texto del evento de calendario que acompaña a una reunión prevista. */
export function reunionEventTitle(r, studentsById) {
  const names = (r.studentIds || []).map((id) => studentsById[id]?.nombre).filter(Boolean);
  const base = r.tipo === 'familia' ? 'Tutoría' : TIPOS_REUNION[r.tipo] || 'Reunión';
  return names.length ? `${base} · ${names.slice(0, 3).join(', ')}${names.length > 3 ? '…' : ''}` : base;
}
