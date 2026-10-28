// Tabula · dictado por voz: hablas, Tabula entiende tareas, eventos, observaciones y tutorías
// y las deja en la bandeja para revisarlas antes de guardarlas. Se abre como hoja desde Hoy.

import { store } from '../store.js';
import { h, icon, toast, openSheet, todayISO } from '../ui.js';
import { interpretDictation } from '../voz-model.js';
import { TIPOS } from '../asistente-model.js';

const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition || null;
const PLURAL = { tarea: 'tareas', evento: 'eventos', observacion: 'observaciones', reunion: 'tutorías' };
let closeSheet = null;

function activeStudents() {
  const groups = new Set(store.list('groups').filter((g) => !g.archivado).map((g) => g.id));
  return store.list('students').filter((s) => groups.has(s.groupId));
}

export function openVoz() {
  if (closeSheet) return closeSheet;
  let rec = null, listening = false;

  const area = h('textarea', {
    class: 'input vz-text', id: 'vz-texto', rows: '6', 'aria-label': 'Lo que has dictado',
    placeholder: 'Ej.: Lucía ha ayudado hoy a un compañero. Mañana claustro a las 5. Recuérdame imprimir las fichas para el viernes.',
  });
  const interim = h('p', { class: 'vz-interim', 'aria-live': 'polite' });
  const status = h('p', { class: 'vz-status', role: 'status' });
  const micBtn = h('button', { type: 'button', class: 'vz-mic', id: 'vz-mic', 'aria-pressed': 'false', onclick: () => (listening ? stop() : start()) });
  const go = h('button', { type: 'button', class: 'btn btn-primary', id: 'vz-revisar', onclick: () => send() }, icon('check', 16), 'Revisar y guardar');

  function paintMic() {
    micBtn.replaceChildren(icon(listening ? 'square' : 'mic', 30), h('span', {}, listening ? 'Parar' : 'Hablar'));
    micBtn.classList.toggle('is-on', listening);
    micBtn.setAttribute('aria-pressed', String(listening));
    micBtn.setAttribute('aria-label', listening ? 'Parar el dictado' : 'Empezar a dictar');
    status.textContent = listening ? 'Te escucho… di varias cosas seguidas si quieres.' : '';
  }

  // Frase a frase (continuous = false) y reinicio automático mientras se quiera seguir: en Android, el modo
  // continuo repite la frase cada vez que crece («Hola», «Hola qué», «Hola qué tal»…).
  let phrase = '', silences = 0;
  function commit() {
    const t = phrase.trim().replace(/[.\s]+$/, '');
    phrase = '';
    if (!t) return;
    const prev = area.value.trim().replace(/[.\s]+$/, '');
    area.value = `${prev ? `${prev}. ` : ''}${t.charAt(0).toUpperCase()}${t.slice(1)}.`;
  }
  function listen() {
    rec = new Recognition();
    rec.lang = 'es-ES'; rec.continuous = false; rec.interimResults = true; rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      // El último resultado es siempre la versión más completa de la frase
      const r = e.results[e.results.length - 1];
      phrase = r[0].transcript;
      silences = 0;
      interim.textContent = r.isFinal ? '' : phrase.trim();
    };
    rec.onerror = (e) => {
      if (e.error === 'no-speech') { silences++; return; }
      if (e.error === 'aborted') return;
      listening = false;
      status.dataset.msg = e.error === 'not-allowed' || e.error === 'service-not-allowed'
        ? 'No hay permiso para usar el micrófono. Actívalo en los ajustes del navegador.'
        : 'El dictado se ha cortado. Vuelve a pulsar «Hablar».';
    };
    rec.onend = () => {
      commit();
      interim.textContent = '';
      if (listening && silences < 3) { try { listen(); return; } catch (err) { console.warn(err); } }
      listening = false; paintMic();
      if (status.dataset.msg) { status.textContent = status.dataset.msg; delete status.dataset.msg; }
      else if (silences >= 3) status.textContent = 'Me he parado porque no oía nada. Pulsa «Hablar» para seguir.';
    };
    rec.start();
  }
  function start() {
    silences = 0; phrase = ''; delete status.dataset.msg;
    try { listening = true; listen(); paintMic(); } catch (e) { listening = false; console.warn(e); paintMic(); }
  }
  function stop() { listening = false; try { rec && rec.stop(); } catch {} paintMic(); }

  async function send() {
    if (listening) { stop(); commit(); }
    const text = area.value.trim();
    if (!text) { toast('Dicta o escribe algo primero'); return; }
    const items = interpretDictation(text, { students: activeStudents(), today: todayISO() });
    if (!items.length) { toast('No he entendido nada que guardar. Prueba con frases más completas.'); return; }
    const now = Date.now();
    items.forEach((it, i) => store.add('bandejaAsistente', {
      origenId: `voz-${now}-${i}`, origen: 'voz', tipo: it.tipo, datos: it.datos, dudas: it.dudas, estado: 'pendiente',
      recibidoEn: now, dispositivoId: '', dispositivo: 'Tu dictado',
    }));
    const resumen = Object.entries(items.reduce((a, it) => ({ ...a, [it.tipo]: (a[it.tipo] || 0) + 1 }), {}))
      .map(([t, n]) => `${n} ${n > 1 ? PLURAL[t] : TIPOS[t].toLowerCase()}`).join(', ');
    closeSheet && closeSheet();
    toast(`Entendido: ${resumen}. Revísalo antes de guardar.`);
    const m = await import('./bandeja.js');
    m.openBandeja();
  }

  const content = h('div', { class: 'vz' },
    Recognition
      ? h('div', { class: 'vz-mic-row' }, micBtn, status)
      : h('p', { class: 'vz-note' }, icon('mic', 16), h('span', {}, 'Este navegador no dicta directamente: pulsa el micrófono de tu teclado para hablar.')),
    area, interim,
    h('details', { class: 'vz-help' }, h('summary', {}, 'Cómo hablarle'),
      h('ul', {},
        h('li', {}, h('strong', {}, 'Observación: '), 'nombra al alumno. «Lucía ha ayudado a un compañero».'),
        h('li', {}, h('strong', {}, 'Tarea: '), '«Recuérdame…», «Tengo que…» o un verbo: «Llamar a la familia de Pablo el lunes».'),
        h('li', {}, h('strong', {}, 'Evento: '), 'con día y hora. «Mañana claustro a las 5».'),
        h('li', {}, h('strong', {}, 'Tutoría: '), '«He hablado con la madre de Pablo…» o «Tutoría con la familia de Lucía el jueves».'),
        h('li', {}, 'Separa cada cosa con una pausa o diciendo «otra cosa». Si dudas, empieza por «tarea», «evento», «observación» o «tutoría».'))),
    h('p', { class: 'vz-privacy' }, icon('lock', 14), h('span', {}, Recognition
      ? 'Tabula entiende lo dictado en tu dispositivo. La voz la convierte en texto tu navegador (en Chrome y Android lo hace Google).'
      : 'Tabula entiende lo dictado en tu dispositivo; no lo envía a ninguna IA.')),
    h('div', { class: 'settings-actions vz-actions' }, go));

  if (Recognition) paintMic();
  closeSheet = openSheet('Dictar a Tabula', content, { className: 'vz-sheet', onClose: () => { stop(); closeSheet = null; } });
  return closeSheet;
}
