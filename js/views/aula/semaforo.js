// Tabula · En clase · Semáforo de ruido (micrófono local o manual)
import { h } from '../../ui.js';
import { svg } from './common.js';

const STATES = [
  { id: 'verde', label: 'Volumen adecuado', short: 'Muy bien' },
  { id: 'ambar', label: 'Un poco alto: bajamos la voz', short: 'Bajamos la voz' },
  { id: 'rojo', label: 'Demasiado ruido', short: 'Silencio, por favor' },
];

export function create(ctx) {
  let mode = 'mic';            // 'mic' | 'manual'
  let state = 0;               // 0 verde · 1 ámbar · 2 rojo
  let sens = 5;
  let stream = null, audioCtx = null, analyser = null, buf = null, timer = null;
  let smooth = -90, lastUp = 0, listening = false, error = '';

  const lamps = STATES.map((s, i) => h('button', { type: 'button', class: `au-lamp au-lamp-${s.id}`, 'aria-label': s.short, onclick: () => manualSet(i) }));
  const light = h('div', { class: 'au-light' }, ...[...lamps].reverse());
  const status = h('div', { class: 'au-light-status', role: 'status', 'aria-live': 'polite' });
  const meterFill = h('i'); const markA = h('b', { class: 'au-mark' }); const markR = h('b', { class: 'au-mark' });
  const meter = h('div', { class: 'au-meter', 'aria-hidden': 'true' }, meterFill, markA, markR);
  const micBtn = h('button', { type: 'button', class: 'btn btn-primary au-big-btn', onclick: () => (listening ? stopMic() : startMic()) });
  const errBox = h('p', { class: 'au-error', role: 'alert' });
  const slider = h('input', { type: 'range', min: 1, max: 10, step: 1, value: sens, id: 'au-sens', class: 'au-range',
    oninput: (e) => { sens = Number(e.target.value); sensVal.textContent = String(sens); paint(); } });
  const sensVal = h('output', { for: 'au-sens' }, String(sens));
  const seg = h('div', { class: 'segmented', role: 'group', 'aria-label': 'Modo del semáforo' });
  const micPanel = h('div', { class: 'au-mic-panel' },
    h('div', { class: 'au-privacy' }, svg('shield', 20), h('p', {}, 'El sonido se analiza en este dispositivo y no se graba ni se envía.')),
    micBtn, errBox,
    h('div', { class: 'field au-sens-field' }, h('label', { for: 'au-sens' }, 'Sensibilidad ', sensVal), slider,
      h('div', { class: 'au-sens-scale' }, h('span', {}, 'Aula muy ruidosa'), h('span', {}, 'Aula tranquila'))),
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Nivel de sonido'), meter));
  const manualHint = h('p', { class: 'au-sub' }, 'Toca una luz para cambiarla a mano.');
  const el = h('div', { class: 'au-semaforo' }, h('div', { class: 'au-light-wrap' }, light, status),
    h('div', { class: 'au-sem-side' }, seg, micPanel, manualHint));

  const thresholds = () => { const amber = -46 - (sens - 5) * 2.5; return [amber, amber + 12]; };

  function paint() {
    seg.replaceChildren(
      h('button', { type: 'button', 'aria-pressed': String(mode === 'mic'), onclick: () => setMode('mic') }, 'Micrófono'),
      h('button', { type: 'button', 'aria-pressed': String(mode === 'manual'), onclick: () => setMode('manual') }, 'Manual'));
    micPanel.hidden = mode !== 'mic'; manualHint.hidden = mode !== 'manual';
    lamps.forEach((l, i) => {
      l.classList.toggle('is-lit', i === state);
      l.disabled = false;
      if (mode === 'manual') { l.removeAttribute('aria-disabled'); l.setAttribute('aria-pressed', String(i === state)); l.tabIndex = 0; }
      else { l.removeAttribute('aria-pressed'); l.setAttribute('aria-disabled', 'true'); l.tabIndex = -1; }
    });
    light.classList.toggle('is-manual', mode === 'manual');
    const idle = mode === 'mic' && !listening;
    light.classList.toggle('is-idle', idle);
    const text = idle ? 'Micrófono apagado' : STATES[state].short;
    if (status.textContent !== text) status.textContent = text;
    micBtn.replaceChildren(svg('mic', 22), listening ? 'Parar micrófono' : 'Activar micrófono');
    errBox.textContent = error; errBox.hidden = !error;
    const [a, r] = thresholds(); const pos = (db) => `${Math.round(Math.min(1, Math.max(0, (db + 70) / 60)) * 100)}%`;
    markA.style.left = pos(a); markR.style.left = pos(r);
  }

  function setMode(m) {
    if (m === mode) return;
    stopMic(); mode = m; error = ''; state = 0; paint();
  }
  function manualSet(i) { if (mode !== 'manual') return; state = i; paint(); }

  async function startMic() {
    error = '';
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('unsupported');
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      const AC = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AC(); if (audioCtx.state === 'suspended') await audioCtx.resume();
      const src = audioCtx.createMediaStreamSource(stream);
      analyser = audioCtx.createAnalyser(); analyser.fftSize = 1024; src.connect(analyser); // sin conectar a la salida: no suena ni se graba
      buf = new Float32Array(analyser.fftSize);
      smooth = -90; state = 0; lastUp = Date.now(); listening = true;
      clearInterval(timer); timer = setInterval(sample, 100);
      paint();
    } catch (e) {
      cleanupAudio(); listening = false;
      error = e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')
        ? 'No tengo permiso para usar el micrófono. Puedes dárselo en los ajustes del navegador, o usar el modo Manual.'
        : 'No se ha podido activar el micrófono en este dispositivo. Puedes usar el modo Manual.';
      paint();
    }
  }
  function cleanupAudio() {
    clearInterval(timer); timer = null;
    try { stream && stream.getTracks().forEach((t) => t.stop()); } catch {}
    try { audioCtx && audioCtx.close(); } catch {}
    stream = null; audioCtx = null; analyser = null;
  }
  function stopMic() {
    const was = listening; listening = false; cleanupAudio();
    if (was) { state = 0; meterFill.style.width = '0%'; paint(); }
  }

  function sample() {
    if (!analyser) return;
    analyser.getFloatTimeDomainData(buf);
    let sum = 0; for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    const db = 20 * Math.log10(Math.max(Math.sqrt(sum / buf.length), 1e-5));
    smooth += (db - smooth) * (db > smooth ? 0.5 : 0.07);   // sube rápido, baja despacio
    const [a, r] = thresholds();
    const target = smooth >= r ? 2 : smooth >= a ? 1 : 0;
    const now = Date.now();
    if (target > state) { state = target; lastUp = now; }
    else if (target < state && now - lastUp > 1500 && smooth < (state === 2 ? r : a) - 3) { state -= 1; lastUp = now; }
    meterFill.style.width = `${Math.round(Math.min(1, Math.max(0, (smooth + 70) / 60)) * 100)}%`;
    paint();
  }

  paint();
  return {
    el,
    onHide() { stopMic(); },   // el micrófono nunca queda abierto en segundo plano
    destroy() { stopMic(); },
  };
}
