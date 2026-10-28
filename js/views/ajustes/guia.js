// Tabula · Ajustes · tarjeta «Guía rápida» (ayudas por sección y datos de ejemplo)
import { store } from '../../store.js';
import { h, icon, toast } from '../../ui.js';
import { loadGuide } from '../../guide.js';

const saveGuide = (g) => store.setSetting('guia', g);

export function guiaCard() {
  const demoBox = h('div', { class: 'gd-demo' });
  const confirmBox = h('div', { class: 'confirm-box', hidden: true });
  let busy = false;

  const toggle = h('input', { type: 'checkbox', class: 'switch', id: 'aj-guia', checked: loadGuide().activa, 'aria-label': 'Mostrar la guía rápida',
    onchange: (e) => { const g = loadGuide(); saveGuide({ ...g, activa: e.target.checked }); toast(e.target.checked ? 'Guía activada' : 'Guía desactivada'); } });
  const reset = h('button', { type: 'button', class: 'btn', onclick: () => {
    saveGuide({ activa: true, vistas: {} }); toggle.checked = true; toast('Volverás a ver todas las ayudas');
  } }, icon('sparkle', 18), 'Volver a mostrar todas las ayudas');

  async function paintDemo() {
    const { hasDemo } = await import('./demo.js');
    const has = hasDemo();
    demoBox.replaceChildren(
      h('p', { class: 'gd-demo-title' }, 'Datos de ejemplo', has ? h('span', { class: 'gd-demo-status' }, icon('check', 13), 'Cargados') : null),
      h('p', { class: 'settings-text' }, has
        ? 'Hay un grupo «1º Demo» con alumnado ficticio, cuaderno, planificación, tareas y eventos. Tus datos reales no se tocan.'
        : 'Crea un grupo «1º Demo» con alumnado ficticio, horario, cuaderno, planificación, tareas y eventos para probar la app. Se puede quitar en cualquier momento.'),
      h('div', { class: 'settings-actions' }, has
        ? h('button', { type: 'button', class: 'btn btn-danger', onclick: () => askRemove() }, icon('trash', 18), 'Quitar datos de ejemplo')
        : h('button', { type: 'button', class: 'btn', disabled: busy, onclick: () => doLoad() }, icon('plus', 18), 'Cargar datos de ejemplo')));
  }

  async function doLoad() {
    busy = true; paintDemo();
    try {
      const m = await import('./demo.js');
      const r = await m.loadDemo();
      toast(r ? `Datos de ejemplo cargados${r.horario ? '' : ' (sin horario: coincidiría con el tuyo)'}` : 'Ya hay datos de ejemplo', r ? { label: 'Deshacer', run: async () => { const x = m.removeDemo(); await x.commit(); paintDemo(); } } : undefined);
    } catch (e) { console.warn(e); toast('No se pudieron cargar los datos de ejemplo'); }
    busy = false; paintDemo();
  }

  async function askRemove() {
    const m = await import('./demo.js');
    confirmBox.hidden = false;
    confirmBox.replaceChildren(
      h('p', {}, 'Se quitarán el grupo «1º Demo» y todo lo que se creó con él: alumnado, horario, cuaderno, notas, planificación, tareas, eventos y la ficha. Tus datos reales no se tocan.'),
      h('div', { class: 'settings-actions' },
        h('button', { type: 'button', class: 'btn btn-danger', onclick: () => {
          const r = m.removeDemo();
          confirmBox.hidden = true; paintDemo();
          let undone = false;
          toast(`Datos de ejemplo quitados (${r.total} elementos)`, { label: 'Deshacer', run: () => { undone = true; m.restoreDemo(r); paintDemo(); } });
          setTimeout(() => { if (!undone) r.commit(); }, 5500);
        } }, 'Quitar'),
        h('button', { type: 'button', class: 'btn', onclick: () => { confirmBox.hidden = true; } }, 'Cancelar')));
  }

  const card = h('section', { class: 'card gd-card', id: 'ajustes-guia' },
    h('div', { class: 'card-head' }, h('h2', { class: 'card-title' }, 'Guía rápida')),
    h('label', { class: 'switch-row' }, h('span', {}, 'Mostrar ayudas en cada sección', h('span', { class: 'gd-sub' }, 'Una nota breve arriba de cada pantalla, que puedes cerrar con «Entendido».')), toggle),
    h('div', { class: 'settings-actions' }, reset),
    h('hr'), demoBox, confirmBox);
  paintDemo();
  return card;
}
