// Tabula · dibuja una ficha de Charta (las hojas A4 en SVG) con el propio motor de Charta, sin salir de Tabula.
// Carga Charta (mismo origen, ../Charta/dist/) en un iframe oculto, que expone `Charta.generar` y `Charta.hojas`.
// Sin nombres de alumnos: una copia con la línea en blanco; el número de copias se elige al imprimir.
import { CHARTA_URL } from './charta.js';
import { chartaOpciones } from './combine-model.js';

/** Abre Charta oculta. Devuelve { api, fonts (reglas @font-face), cerrar() }. */
export async function abrirCharta({ espera = 20000 } = {}) {
  const f = document.createElement('iframe');
  f.setAttribute('aria-hidden', 'true'); f.tabIndex = -1;
  f.style.cssText = 'position:fixed;left:-9999px;top:0;width:900px;height:700px;border:0;visibility:hidden';
  f.src = `${CHARTA_URL}dist/index.html`;
  const cerrar = () => f.remove();
  document.body.append(f);
  const t0 = Date.now();
  try {
    while (!(f.contentWindow && f.contentWindow.Charta && f.contentWindow.Charta.hojas)) {
      if (Date.now() - t0 > espera) throw new Error('No se pudo abrir Charta para dibujar la ficha. Comprueba la conexión.');
      await new Promise((r) => setTimeout(r, 100));
    }
    try { await f.contentDocument.fonts.ready; } catch {}
    const fonts = [...f.contentDocument.styleSheets].flatMap((s) => { try { return [...s.cssRules]; } catch { return []; } })
      .filter((r) => r.type === 5).map((r) => r.cssText); // 5 = @font-face
    return { api: f.contentWindow.Charta, fonts, cerrar };
  } catch (e) { cerrar(); throw e; }
}

/** SVG de cada hoja de la ficha (una variante, sin nombre). Lanza Error legible si Charta no puede dibujarla. */
export function hojasDeFicha(api, doc) {
  const o = chartaOpciones(doc && doc.charta && doc.charta.comp);
  if (!o) throw new Error(`«${(doc && doc.titulo) || 'Ficha'}»: la ficha no guarda su composición; ábrela en Charta.`);
  try {
    const ficha = api.generar(o.opciones, o.semilla);
    return api.hojas(ficha, { copias: 1, bn: o.bn }).map((p) => p.svg);
  } catch (e) { throw new Error(`«${doc.titulo}»: ${e.message || 'Charta no pudo dibujar la ficha'}`); }
}
