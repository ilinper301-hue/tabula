// Tabula · Encuestas · plantillas para empezar rápido
import { newQuestion } from '../../surveys.js';
import { getPrograms } from '../../programs.js';

const q = (tipo, texto, extra = {}) => ({ ...newQuestion(tipo), texto, ...extra });
const scale = (texto, etiquetaMin, etiquetaMax, extra = {}) => q('escala', texto, { escala: { min: 1, max: 5, etiquetaMin, etiquetaMax }, ...extra });

export const TEMPLATES = [
  {
    id: 'valoracion',
    nombre: 'Valoración de una actividad',
    desc: 'Escala de satisfacción y dos preguntas abiertas.',
    build: () => ({
      titulo: 'Valoración de la actividad',
      descripcion: 'Tu opinión nos ayuda a mejorar la próxima vez. Gracias por dedicarle un par de minutos.',
      pedirNombre: 'no',
      preguntas: [
        scale('¿Qué valoración global das a la actividad?', 'Muy mala', 'Muy buena', { obligatoria: true }),
        scale('¿Crees que ha sido útil para el alumnado?', 'Nada útil', 'Muy útil'),
        q('larga', '¿Qué es lo que mejor ha funcionado?'),
        q('larga', '¿Qué cambiarías o mejorarías?'),
        q('sino', '¿Repetirías la actividad el próximo curso?'),
      ],
    }),
  },
  {
    id: 'reunion',
    nombre: 'Disponibilidad para una reunión',
    desc: 'Días y franjas horarias para encontrar el mejor momento.',
    build: () => ({
      titulo: 'Disponibilidad para la reunión',
      descripcion: 'Marca todos los días y franjas en los que podrías asistir; buscaremos el momento que le venga bien a más gente.',
      pedirNombre: 'obligatorio',
      preguntas: [
        q('multiple', '¿Qué días puedes asistir?', { obligatoria: true, opciones: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'] }),
        q('multiple', '¿En qué franjas te viene bien?', { obligatoria: true, opciones: ['Primera hora (9:00–10:00)', 'Recreo (11:30–12:00)', 'Última hora (13:00–14:00)', 'Tarde (16:00–17:00)', 'Tarde (17:00–18:00)'] }),
        q('larga', '¿Algún comentario o restricción que debamos tener en cuenta?'),
      ],
    }),
  },
  {
    id: 'steam',
    nombre: 'Necesidades de formación STEAM',
    desc: 'Nivel previo, temas de interés y formato preferido.',
    build: () => {
      // Si ya existe un programa STEAM, la encuesta se enlaza con él.
      const prog = getPrograms().find((p) => /steam/i.test(`${p.nombre} ${p.etiqueta || ''}`));
      return {
        titulo: 'Necesidades de formación STEAM',
        descripcion: 'Queremos organizar la formación del claustro según lo que de verdad necesitáis.',
        pedirNombre: 'opcional',
        programaId: prog ? prog.id : null,
        preguntas: [
          q('unica', '¿Cuál es tu experiencia con proyectos STEAM en el aula?', { obligatoria: true, opciones: ['Ninguna', 'Básica', 'Intermedia', 'Avanzada'] }),
          q('multiple', '¿En qué temas te gustaría formarte?', { opciones: ['Robótica y programación', 'Pensamiento computacional', 'Aprendizaje basado en proyectos', 'Ciencia y experimentación', 'Herramientas digitales', 'Diseño e impresión 3D'] }),
          q('unica', '¿Qué formato prefieres?', { opciones: ['Taller presencial en el centro', 'Curso en línea', 'Grupo de trabajo con compañeros', 'Asesoramiento en el aula'] }),
          q('larga', '¿Hay alguna otra necesidad o propuesta?'),
        ],
      };
    },
  },
];
