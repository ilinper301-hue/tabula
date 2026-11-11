// Tabula · Ajustes: descarga de la copia de seguridad (compartido por varios paneles)

import { h } from '../../ui.js';

/**
 * Crea la copia completa (.zip) y la descarga.
 * @param onProgress (texto | null) opcional
 * @returns { archivos, faltan, mensaje }
 */
export async function descargarCopia(onProgress = () => {}) {
  const { createBackup } = await import('../../backup.js');
  const { blob, nombre, archivos, faltan } = await createBackup(onProgress);
  const a = h('a', { href: URL.createObjectURL(blob), download: nombre });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  const mensaje = faltan
    ? `Copia descargada (${faltan} ${faltan === 1 ? 'archivo no estaba' : 'archivos no estaban'} en este dispositivo)`
    : `Copia descargada${archivos ? ` con ${archivos} ${archivos === 1 ? 'archivo' : 'archivos'}` : ''}`;
  return { archivos, faltan, mensaje };
}
