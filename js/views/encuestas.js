// Tabula · vista «Encuestas» (encuestas para compañeros)
//
// Rutas: #/encuestas                      listado
//        #/encuestas?id=…&tab=editar|compartir|resultados   editor de una encuesta
// Módulos en ./encuestas/ :
//   list.js       listado, estado vacío y plantillas      templates.js  plantillas
//   editor.js     cabecera, pestañas, guardado automático
//   tab-editar.js · tab-compartir.js · tab-resultados.js
//   question-card.js · preview.js · model.js · common.js
// El modelo y la nube están en js/surveys.js.
import { store } from '../store.js';
import { toast } from '../ui.js';
import { onNewResponse } from '../surveys.js';
import { renderList } from './encuestas/list.js';
import { renderEditor } from './encuestas/editor.js';

export function render(container, params = new URLSearchParams()) {
  container.classList.add('enc-view');
  const id = params.get('id');
  const cleanup = id && store.get('encuestas', id)
    ? renderEditor(container, id, params.get('tab'))
    : renderList(container);
  return () => { try { cleanup(); } finally { container.classList.remove('enc-view', 'enc-view-wide'); } };
}

let stopToasts = null;
/** Avisa con un toast cuando llega una respuesta nueva (llamar una vez al iniciar la app). */
export function startResponseToasts() {
  if (stopToasts) return stopToasts;
  stopToasts = onNewResponse(({ encuesta }) => {
    const titulo = store.get('encuestas', encuesta.id)?.titulo || encuesta.titulo || 'encuesta';
    toast(`Nueva respuesta en «${titulo}»`, {
      label: 'Ver', run: () => { location.hash = `#/encuestas?id=${encodeURIComponent(encuesta.id)}&tab=resultados`; },
    });
  });
  return stopToasts;
}
