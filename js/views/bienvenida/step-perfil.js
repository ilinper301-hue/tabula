// Paso 1 · Bienvenida y nombre (ambos campos opcionales)
import { store } from '../../store.js';
import { h, googleButton } from '../../ui.js';
import { field, getDraft, setDraft } from './common.js';
import { getSyncState, signIn } from '../../sync.js';

export function stepPerfil(ctx) {
  const profile = store.getSetting('profile', null) || {};
  const draft = getDraft('perfil', {});
  const nombre = h('input', {
    class: 'input bv-input', type: 'text', autocomplete: 'name', maxlength: 80,
    placeholder: 'Tu nombre y apellidos', value: draft.nombre ?? profile.nombre ?? '',
  });
  const centro = h('input', {
    class: 'input bv-input', type: 'text', autocomplete: 'organization', maxlength: 100,
    placeholder: 'Por ejemplo, CEIP Miguel de Cervantes', value: draft.centro ?? profile.centro ?? '',
  });
  const remember = () => setDraft('perfil', { nombre: nombre.value, centro: centro.value });
  nombre.addEventListener('input', remember);
  centro.addEventListener('input', remember);

  const el = h('form', { class: 'bv-form', novalidate: true, onsubmit: (e) => { e.preventDefault(); ctx.next(); } },
    h('ul', { class: 'bv-perks' },
      ['Tu horario y las tareas del día, de un vistazo.', 'Lista, notas y observaciones de cada alumno.', 'Funciona en el móvil, la tableta y el ordenador.']
        .map((t) => h('li', {}, t))),
    field('¿Cómo te llamas?', nombre, 'Así te saludaremos cada mañana en Hoy.'),
    field('Centro (opcional)', centro),
    // Quien ya usa Tabula en otro dispositivo no necesita el asistente: entra y recupera sus datos
    getSyncState().enabled ? h('div', { class: 'bv-signin' },
      h('span', {}, '¿Ya usas Tabula en otro dispositivo?'),
      googleButton(async () => {
        try {
          await signIn();
          store.setSetting('onboarding', { ...(store.getSetting('onboarding', {}) || {}), skipped: true });
          location.hash = '#/hoy';
        } catch {}
      })) : null,
    h('button', { type: 'submit', class: 'sr-only', tabindex: '-1' }, 'Siguiente'));

  return {
    title: 'Te damos la bienvenida a Tabula',
    lead: 'Tu planificación, tu agenda y tu evaluación en un solo sitio. En unos tres minutos lo dejamos listo para tu clase.',
    el,
    skipLabel: 'Saltar este paso',
    next() {
      const n = nombre.value.trim(), c = centro.value.trim();
      // No guardamos un perfil vacío si no había nada; si lo había, se respetan el resto de claves.
      if (n || c || profile.nombre || profile.centro) store.setSetting('profile', { ...profile, nombre: n, centro: c });
      return true;
    },
  };
}
