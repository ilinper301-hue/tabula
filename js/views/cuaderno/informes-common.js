// Tabula · Cuaderno · Informes · utilidades compartidas
import { store } from '../../store.js';
import { currentSchoolYear } from '../../school.js';

export const profileSetting = () => store.getSetting('profile', { nombre: '', centro: '' }) || {};
export const cursoLabel = (group) => group?.cursoEscolar || currentSchoolYear();

/** Copia texto al portapapeles (con alternativa para navegadores sin permiso). */
export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* alternativa */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.append(ta); ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch { return false; }
}

/** Descarga un texto como archivo. */
export function downloadText(filename, text, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
