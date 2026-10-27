// Tabula · Planes y programas · pestaña Equipo (compañeros y enlaces útiles)
import { h } from '../../ui.js';
import { mountListEditor } from './listeditor.js';
import { cleanUrl, extLink } from './common.js';

export function mountEquipo(panel, programaId) {
  const stack = h('div', { class: 'pg-stack' });
  panel.replaceChildren(stack);

  const u1 = mountListEditor(stack, programaId, {
    key: 'equipo', noun: 'compañero', title: 'Equipo',
    hint: 'Solo nombre y función; no guardes datos personales.',
    empty: 'Aún no has añadido a nadie del equipo.',
    fields: [
      { name: 'nombre', label: 'Nombre', required: true, maxlength: 80 },
      { name: 'rol', label: 'Función', placeholder: 'Función (ej. coordinadora de ciclo)', maxlength: 80 },
    ],
    renderMain: (m) => [h('strong', {}, m.nombre), m.rol ? h('span', { class: 'pg-row-sub' }, m.rol) : null],
  });

  const u2 = mountListEditor(stack, programaId, {
    key: 'enlaces', noun: 'enlace', title: 'Enlaces útiles',
    hint: 'Guías, carpetas compartidas, formularios… Se abren en una pestaña nueva.',
    empty: 'Aún no has guardado enlaces.',
    fields: [
      { name: 'titulo', label: 'Título', required: true, maxlength: 80 },
      { name: 'url', label: 'Dirección', placeholder: 'https://…', type: 'text', required: true, maxlength: 500 },
    ],
    check: (v) => {
      const url = cleanUrl(v.url);
      return url ? { values: { ...v, url } } : { error: 'La dirección debe ser una web válida (http:// o https://).' };
    },
    renderMain: (l) => [h('strong', {}, l.titulo), extLink(l.url, l.url.replace(/^https?:\/\//, ''), 'pg-link pg-row-sub')],
  });
  return () => { u1(); u2(); };
}
