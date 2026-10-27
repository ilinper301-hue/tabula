// Tabula · Cuaderno · exportación a CSV (separador «;», UTF-8 con BOM, coma decimal)
import { entryScore, toLevel, formatGrade } from '../../grading.js';
import { areaShort } from '../../school.js';
import { slug } from './common.js';

/** Protege un texto frente a fórmulas de Excel (=, +, -, @) y escapa comillas/separadores. */
function cell(v) {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Construye el texto CSV del cuaderno para la evaluación seleccionada. */
export function buildCsv(ctx, columns) {
  const { gb, students, results } = ctx;
  const crit = gb.modo === 'criterios' ? (gb.criterios || []) : [];
  const head = ['Apellidos', 'Nombre', ...columns.map((a) => a.nombre), 'Nota', 'Nivel', ...crit.map((c) => c.codigo || c.descripcion)];
  const lines = [head.map(cell).join(';')];
  for (const s of students) {
    const r = results[s.id];
    const acts = columns.map((a) => formatGrade(entryScore(a, ctx.gradesByAct[a.id]?.notas?.[s.id]), 'numerica'));
    lines.push([
      s.apellidos || '', s.nombre || '', ...acts,
      formatGrade(r?.nota, 'numerica'), toLevel(r?.nota) || '',
      ...crit.map((c) => formatGrade(r?.porCriterio?.[c.id], 'numerica')),
    ].map(cell).join(';'));
  }
  return lines.join('\r\n');
}

/** Descarga el CSV. */
export function downloadCsv(ctx, group, area, ev) {
  const csv = '﻿' + buildCsv(ctx, ctx.visible);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `cuaderno-${slug(group.nombre)}-${slug(areaShort(area))}-${ev}.csv`;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
