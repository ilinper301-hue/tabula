// Tabula · En clase · Temporizador
import { h } from '../../ui.js';
import { svg } from './common.js';

const PRESETS = [1, 3, 5, 10, 15];
const R = 90, C = 2 * Math.PI * R;
const fmt = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

export function create(ctx) {
  let total = 5 * 60000, remaining = total, endAt = 0, running = false, finished = false;
  let tick = null, wake = null, audio = null, lastSaid = -1;

  const time = h('div', { class: 'au-ring-time', role: 'timer', 'aria-label': 'Tiempo restante' });
  const sub = h('div', { class: 'au-ring-sub' });
  const live = h('div', { class: 'sr-only', role: 'status', 'aria-live': 'polite' });
  const ring = h('div', { class: 'au-ring' });
  ring.innerHTML = `<svg viewBox="0 0 200 200" aria-hidden="true"><circle class="au-ring-bg" cx="100" cy="100" r="${R}"/><circle class="au-ring-fg" cx="100" cy="100" r="${R}" stroke-dasharray="${C}" stroke-dashoffset="0" transform="rotate(-90 100 100)"/></svg>`;
  const fg = ring.querySelector('.au-ring-fg');
  ring.append(h('div', { class: 'au-ring-center' }, time, sub));

  const startBtn = h('button', { type: 'button', class: 'btn btn-primary au-big-btn', onclick: () => (running ? pause() : start()) });
  const resetBtn = h('button', { type: 'button', class: 'btn au-big-btn', onclick: () => reset() }, svg('reset', 20), 'Reiniciar');
  const plusBtn = h('button', { type: 'button', class: 'btn au-big-btn', 'aria-label': 'Añadir un minuto', onclick: () => addMinute() }, '+1 min');

  const presetBtns = PRESETS.map((m) => h('button', { type: 'button', class: 'au-chip-btn', 'data-min': m, onclick: () => setTotal(m * 60000) }, `${m} min`));
  const custom = h('input', { class: 'input au-custom', type: 'number', min: 1, max: 99, inputmode: 'numeric', placeholder: 'min', 'aria-label': 'Minutos personalizados',
    onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); applyCustom(); } } });
  const customBtn = h('button', { type: 'button', class: 'btn', onclick: () => applyCustom() }, 'Fijar');

  const el = h('div', { class: 'au-timer' },
    h('div', { class: 'au-timer-main' }, ring,
      h('div', { class: 'au-actions' }, startBtn, resetBtn, plusBtn)),
    h('div', { class: 'au-timer-side' },
      h('div', { class: 'section-label' }, 'Duración'),
      h('div', { class: 'au-presets', role: 'group', 'aria-label': 'Duraciones rápidas' }, presetBtns),
      h('div', { class: 'au-custom-row' }, h('label', { class: 'sr-only', for: 'au-custom' }, 'Minutos personalizados'), custom, customBtn)),
    live);
  custom.id = 'au-custom';

  function paint() {
    const left = running ? Math.max(0, endAt - Date.now()) : remaining;
    time.textContent = fmt(left);
    fg.setAttribute('stroke-dashoffset', String(C * (1 - (total ? left / total : 0))));
    el.classList.toggle('is-running', running);
    el.classList.toggle('is-done', finished);
    sub.textContent = finished ? '¡Tiempo!' : running ? 'En marcha' : left < total ? 'En pausa' : `${Math.round(total / 60000)} min`;
    startBtn.replaceChildren(svg(running ? 'pause' : 'play', 22), finished ? 'Otra vez' : running ? 'Pausa' : left < total ? 'Seguir' : 'Iniciar');
    plusBtn.disabled = finished;
    presetBtns.forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.min) * 60000 === total)));
    ctx.badge(running ? fmt(left) : finished ? '¡Ya!' : '');
    // Aviso accesible solo al cambiar de minuto
    if (running) {
      const m = Math.ceil(left / 60000);
      if (m !== lastSaid && left > 0) { lastSaid = m; if (m < Math.ceil(total / 60000)) live.textContent = `Quedan ${m} minuto${m === 1 ? '' : 's'}`; }
    }
  }

  function onTick() {
    const left = endAt - Date.now();
    if (left <= 0) return finish();
    paint();
  }

  async function requestWake() {
    try { if ('wakeLock' in navigator && document.visibilityState === 'visible') wake = await navigator.wakeLock.request('screen'); } catch {}
  }
  function releaseWake() { try { wake && wake.release(); } catch {} wake = null; }
  const onVis = () => { if (running && document.visibilityState === 'visible') requestWake(); };
  document.addEventListener('visibilitychange', onVis);

  function ensureAudio() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!audio && AC) audio = new AC();
      if (audio && audio.state === 'suspended') audio.resume();
    } catch {}
  }
  function beep() {
    ensureAudio();
    if (!audio) return;
    try {
      const t0 = audio.currentTime + 0.05;
      [0, 0.55, 1.1].forEach((dt) => {
        const o = audio.createOscillator(); const g = audio.createGain();
        o.type = 'sine'; o.frequency.value = 660;
        g.gain.setValueAtTime(0.0001, t0 + dt);
        g.gain.exponentialRampToValueAtTime(0.22, t0 + dt + 0.04);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 0.45);
        o.connect(g).connect(audio.destination); o.start(t0 + dt); o.stop(t0 + dt + 0.5);
      });
    } catch {}
    try { navigator.vibrate && navigator.vibrate([200, 100, 200]); } catch {}
  }

  function start() {
    if (finished || remaining <= 0) { finished = false; remaining = total; }
    ensureAudio();
    running = true; endAt = Date.now() + remaining; lastSaid = -1;
    clearInterval(tick); tick = setInterval(onTick, 200);
    requestWake();
    live.textContent = `Temporizador en marcha: ${fmt(remaining)}`;
    paint();
  }
  function pause() {
    remaining = Math.max(0, endAt - Date.now()); running = false;
    clearInterval(tick); releaseWake();
    live.textContent = 'Temporizador en pausa';
    paint();
  }
  function reset() {
    running = false; finished = false; remaining = total;
    clearInterval(tick); releaseWake();
    live.textContent = 'Temporizador reiniciado';
    paint();
  }
  function finish() {
    running = false; finished = true; remaining = 0;
    clearInterval(tick); releaseWake();
    live.textContent = 'Se acabó el tiempo';
    beep(); paint();
  }
  function setTotal(ms) { total = ms; reset(); }
  function addMinute() {
    if (running) { endAt += 60000; total += 60000; } else { remaining += 60000; total = Math.max(total, remaining); }
    paint();
  }
  function applyCustom() {
    const m = Math.round(Number(custom.value));
    if (!(m >= 1 && m <= 99)) { custom.focus(); custom.setCustomValidity('Entre 1 y 99'); custom.reportValidity(); custom.setCustomValidity(''); return; }
    setTotal(m * 60000); custom.value = '';
  }

  paint();
  return {
    el,
    destroy() { clearInterval(tick); releaseWake(); document.removeEventListener('visibilitychange', onVis); try { audio && audio.close(); } catch {} ctx.badge(''); },
  };
}
