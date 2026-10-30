// Tabula · pruebas de la lógica pura (sin navegador). Se ejecutan con:  node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { toLevel, wmean } from '../js/grading.js';
import { senecaGrade, draftComment } from '../js/informes.js';
import { parseQuickInput } from '../js/tasks-model.js';
import { interpretDictation, sound } from '../js/voz-model.js';
import { buildLectura, matchStudents, normalizeItem } from '../js/asistente-model.js';
import { normalizeMobileNav, DEFAULT_MOBILE } from '../js/nav-model.js';
import { buildItems } from '../js/search.js';
import { crc32 } from '../js/backup.js';
import { buildFranjas, TRAMOS } from '../js/timetable.js';

const HOY = new Date(2026, 9, 28);   // miércoles 28 oct 2026
const hoy = '2026-10-28';

test('notas: niveles, media ponderada y Séneca', () => {
  assert.equal(toLevel(4.99), 'IN');
  assert.equal(toLevel(5), 'SU');
  assert.equal(toLevel(8.9), 'NT');
  assert.equal(toLevel(9), 'SB');
  assert.equal(toLevel(null), null);
  assert.equal(wmean([{ v: 10, w: 1 }, { v: 5, w: 3 }]), 6.25);
  assert.equal(wmean([]), null);
  assert.deepEqual(senecaGrade(4.6), { num: 4, cal: 'IN' });   // no sube de nivel al redondear
  assert.deepEqual(senecaGrade(7.5), { num: 8, cal: 'NT' });
});

test('tareas: escritura rápida en lenguaje natural', () => {
  const t = parseQuickInput('corregir dictado mañana a las 16:30 #lengua !', HOY);
  assert.equal(t.title, 'corregir dictado');
  assert.equal(t.due, '2026-10-29');
  assert.equal(t.time, '16:30');
  assert.deepEqual(t.tags, ['lengua']);
  assert.equal(t.priority, 1);
  assert.equal(parseQuickInput('reunión el viernes', HOY).due, '2026-10-30');
  assert.equal(parseQuickInput('entregar notas 3/11', HOY).due, '2026-11-03');
});

const ALUMNOS = [
  { id: 'c', nombre: 'Cristian', apellidos: 'Pérez', groupId: 'g' },
  { id: 'l', nombre: 'Lucía', apellidos: 'Pérez Ruiz', groupId: 'g' },
  { id: 'p1', nombre: 'Pablo', apellidos: 'Gómez', groupId: 'g' },
  { id: 'p2', nombre: 'Pablo', apellidos: 'Sanz', groupId: 'g' },
  { id: 'mj', nombre: 'María José', apellidos: 'León', groupId: 'g' },
  { id: 'j', nombre: 'José', apellidos: 'Ríos', groupId: 'g' },
];
const dicta = (t) => interpretDictation(t, { students: ALUMNOS, today: hoy, now: HOY });

test('dictado: tipos de apunte', () => {
  const r = dicta('Lucía ha ayudado hoy a un compañero. Mañana claustro a las 5. Recuérdame imprimir las fichas el viernes. He hablado por teléfono con la madre de Lucía');
  assert.deepEqual(r.map((x) => x.tipo), ['observacion', 'evento', 'tarea', 'reunion']);
  assert.equal(r[0].datos.studentId, 'l');
  assert.equal(r[0].datos.tipo, 'positiva');
  assert.equal(r[1].datos.hora, '17:00');            // en un colegio, «a las 5» es por la tarde
  assert.equal(r[2].datos.fecha, '2026-10-30');
  assert.equal(r[3].datos.modalidad, 'telefono');
});

test('dictado: nombres por cómo suenan y alumnado desconocido o ambiguo', () => {
  assert.equal(sound('Christian'), sound('Cristián'));
  assert.equal(dicta('Christian no ha traído el libro')[0].datos.studentId, 'c');
  const desconocido = dicta('Marcos ha ayudado a recoger')[0];
  assert.equal(desconocido.tipo, 'observacion');
  assert.equal(desconocido.datos.studentId, null);
  assert.equal(desconocido.datos.alumnoTexto, 'Marcos');
  const ambiguo = dicta('Pablo ha leído en voz alta')[0];
  assert.equal(ambiguo.datos.studentId, null);       // hay dos Pablos: lo decide el docente
  assert.equal(dicta('Pablo Sanz ha leído en voz alta')[0].datos.studentId, 'p2');
  // «María José» no debe asignarse también a José
  assert.deepEqual(dicta('María José ha trabajado muy bien').map((x) => x.datos.studentId), ['mj']);
  // Frases que no son de un alumno siguen siendo tareas
  assert.equal(dicta('Hoy ha llovido mucho')[0].tipo, 'tarea');
  assert.equal(dicta('Recuérdame llamar a la madre de Cristian')[0].tipo, 'tarea');
});

test('asistente: del alumnado solo salen iniciales', () => {
  const lectura = buildLectura({
    groups: [{ id: 'g', nombre: '4ºA' }], tasks: [], events: [], today: hoy,
    students: [
      { id: '1', groupId: 'g', nombre: 'Jesús María', apellidos: 'García Martín', orden: 1 },
      { id: '2', groupId: 'g', nombre: 'Juan', apellidos: 'Gil Mora', orden: 2 },
      { id: '3', groupId: 'g', nombre: 'Julia', apellidos: 'Gómez Mesa', orden: 3 },
    ],
  });
  const json = JSON.stringify(lectura);
  for (const nombre of ['Jesús', 'García', 'Juan', 'Gil', 'Julia']) assert.ok(!json.includes(nombre), `no debe salir «${nombre}»`);
  const [a, b, c] = lectura.grupos[0].alumnos;
  assert.equal(`${a.nombre} ${a.apellidos}`, 'J. M. G. M.');
  assert.match(b.apellidos, /n\.º 2/);              // J. G. M. repetido: se distingue por el número de lista
  assert.match(c.apellidos, /n\.º 3/);
  // El buscador del asistente encuentra las iniciales escribiendo el nombre completo
  assert.equal(matchStudents(lectura.grupos, 'Jesús María García')[0].id, '1');
});

test('asistente: los apuntes recibidos se limpian y validan', () => {
  const ctx = { students: new Map([['s1', { id: 's1', groupId: 'g' }]]), today: hoy };
  assert.equal(normalizeItem('tarea', { titulo: '   ' }, ctx).ok, false);
  assert.equal(normalizeItem('evento', { titulo: 'Claustro', fecha: 'mañana' }, ctx).ok, false);
  const obs = normalizeItem('observacion', { texto: 'x'.repeat(5000), studentId: 'otro' }, ctx);
  assert.equal(obs.datos.texto.length, 2000);
  assert.equal(obs.datos.studentId, null);           // un id que no es del docente no se acepta
  assert.equal(normalizeItem('desconocido', {}, ctx).ok, false);
});

test('informes: borrador del comentario', () => {
  const bueno = draftComment({
    nombre: 'Lucía', areas: [{ area: 'Matemáticas', nota: 8 }, { area: 'Lengua Castellana y Literatura', nota: 7.2 }],
    obs: [{ tipo: 'positiva', etiqueta: 'Participa' }, { tipo: 'positiva', etiqueta: 'Participa' }],
  });
  assert.match(bueno, /^Lucía ha tenido un muy buen trimestre\./);
  assert.match(bueno, /Matemáticas y Lengua/);
  assert.match(bueno, /participa activamente/);
  const flojo = draftComment({ nombre: 'Pablo', areas: [{ area: 'Matemáticas', nota: 4 }], asistencia: { faltas: 6, retrasos: 0 }, final: true });
  assert.match(flojo, /dificultades este curso/);
  assert.match(flojo, /Debe reforzar Matemáticas/);
  assert.match(flojo, /mejorar la asistencia/);
  // Una observación aislada no se menciona
  assert.ok(!draftComment({ nombre: 'Ana', obs: [{ tipo: 'negativa', etiqueta: 'Interrumpe' }] }).includes('turno'));
});

test('menú: barra inferior del móvil', () => {
  assert.deepEqual(normalizeMobileNav(['hoy', 'tareas', 'codigos', 'grupos']), ['hoy', 'tareas', 'codigos', 'grupos']);
  assert.deepEqual(normalizeMobileNav(['hoy', 'hoy', 'x', 'grupos']), DEFAULT_MOBILE);
  assert.deepEqual(normalizeMobileNav(null), DEFAULT_MOBILE);
});

test('buscador: los códigos se encuentran por nombre, nunca por el código', () => {
  const items = buildItems({ codigos: [{ id: 'c1', titulo: 'Impresora sala', categoria: 'impresora', codigo: '4512-SECRETO' }] });
  const json = JSON.stringify(items);
  assert.ok(json.includes('Impresora sala'));
  assert.ok(!json.includes('4512-SECRETO'));
});

test('copia de seguridad: CRC32 del .zip', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')).toString(16), 'cbf43926');
});

test('horario: tramos de 15, 30, 45 y 60 minutos', () => {
  assert.deepEqual(TRAMOS, [15, 30, 45, 60]);
  const f = buildFranjas({ inicio: '09:00', duracion: 15, sesiones: 3, recreoTras: 2, recreoDuracion: 15 });
  assert.deepEqual(f.map((x) => `${x.inicio}-${x.fin} ${x.tipo}`), ['09:00-09:15 clase', '09:15-09:30 clase', '09:30-09:45 recreo', '09:45-10:00 clase']);
  assert.equal(buildFranjas({ inicio: '09:00', duracion: 30, sesiones: 2, recreoTras: 0 }).at(-1).fin, '10:00');
});
