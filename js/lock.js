// Tabula · bloqueo de la app con PIN (y huella / Face ID opcional)
//
// Qué hace: impide que otra persona vea Tabula en este dispositivo (móvil olvidado en clase,
// ordenador compartido). Se bloquea al abrir la app y tras un tiempo sin usarla o fuera de ella.
// Qué NO hace: no cifra los datos guardados en el navegador. Es un bloqueo de pantalla.
//
// El PIN nunca se guarda: se guarda un hash PBKDF2-SHA256 con sal aleatoria.
// La huella / Face ID usa WebAuthn con el autenticador del propio dispositivo
// (la verificación la hace el sistema operativo; no sale nada del dispositivo).
// La configuración es de cada dispositivo: no se sincroniza.

import { h, icon } from './ui.js';

const KEY = 'tabula:v1:set:lock';
const FAIL_KEY = 'tabula:v1:lockFails';
const ITERATIONS = 150000;
export const TIMEOUTS = [
  { min: 0, label: 'Al salir de la app' },
  { min: 1, label: 'Tras 1 minuto' },
  { min: 5, label: 'Tras 5 minutos' },
  { min: 15, label: 'Tras 15 minutos' },
];

// ---------- Almacenamiento ----------
function readCfg() {
  try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; }
}
function writeCfg(cfg) {
  try { cfg ? localStorage.setItem(KEY, JSON.stringify(cfg)) : localStorage.removeItem(KEY); } catch {}
  listeners.forEach((fn) => { try { fn(); } catch {} });
}
const listeners = new Set();
export const onLockConfigChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

export const isLockEnabled = () => !!readCfg()?.enabled;
export const lockTimeout = () => readCfg()?.timeoutMin ?? 1;
export const hasBiometric = () => !!readCfg()?.bio;

// ---------- Criptografía ----------
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function hashPin(pin, saltB64, iterations = ITERATIONS) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: unb64(saltB64), iterations }, key, 256);
  return b64(bits);
}

/** Comparación en tiempo constante. */
function sameString(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export const isValidPin = (pin) => /^\d{4,6}$/.test(pin);

/** Activa el bloqueo (o cambia el PIN). */
export async function setPin(pin, { timeoutMin } = {}) {
  if (!isValidPin(pin)) throw new Error('El PIN debe tener de 4 a 6 cifras.');
  const salt = b64(crypto.getRandomValues(new Uint8Array(16)));
  const prev = readCfg() || {};
  writeCfg({
    ...prev, enabled: true, salt, iterations: ITERATIONS, hash: await hashPin(pin, salt),
    timeoutMin: timeoutMin ?? prev.timeoutMin ?? 1,
    pinLength: pin.length, // para desbloquear sin pulsar "Desbloquear"
  });
  resetFails();
}

export async function verifyPin(pin) {
  const cfg = readCfg();
  if (!cfg?.enabled) return true;
  const h2 = await hashPin(pin, cfg.salt, cfg.iterations || ITERATIONS);
  return sameString(h2, cfg.hash);
}

export function setLockTimeout(min) { const c = readCfg(); if (c) writeCfg({ ...c, timeoutMin: min }); }

/** Desactiva el bloqueo (pide el PIN actual). */
export async function disableLock(currentPin) {
  if (!(await verifyPin(currentPin))) throw new Error('PIN incorrecto.');
  writeCfg(null); resetFails();
}

// ---------- Intentos fallidos (espera creciente) ----------
function fails() { try { return JSON.parse(localStorage.getItem(FAIL_KEY)) || { n: 0, until: 0 }; } catch { return { n: 0, until: 0 }; } }
function resetFails() { try { localStorage.removeItem(FAIL_KEY); } catch {} }
function registerFail() {
  const f = fails(); f.n += 1;
  // A partir del 5.º fallo: 30 s, 60 s, 120 s… (máx. 15 min)
  if (f.n >= 5) f.until = Date.now() + Math.min(15 * 60, 30 * 2 ** (f.n - 5)) * 1000;
  try { localStorage.setItem(FAIL_KEY, JSON.stringify(f)); } catch {}
  return f;
}

// ---------- Huella / Face ID (WebAuthn) ----------
export async function biometricAvailable() {
  try {
    return !!(window.PublicKeyCredential && window.isSecureContext
      && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
  } catch { return false; }
}

export async function enableBiometric() {
  const cfg = readCfg();
  if (!cfg?.enabled) throw new Error('Activa primero el PIN.');
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { name: 'Tabula' },
      user: { id: crypto.getRandomValues(new Uint8Array(16)), name: 'tabula', displayName: 'Tabula' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
      timeout: 60000,
    },
  });
  if (!cred) throw new Error('No se pudo registrar la huella.');
  writeCfg({ ...cfg, bio: { id: b64(cred.rawId) } });
}
export function disableBiometric() { const c = readCfg(); if (c) { delete c.bio; writeCfg(c); } }

async function verifyBiometric() {
  const cfg = readCfg();
  if (!cfg?.bio) return false;
  const res = await navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      allowCredentials: [{ type: 'public-key', id: unb64(cfg.bio.id) }],
      userVerification: 'required',
      timeout: 60000,
    },
  });
  return !!res;
}

// ---------- Pantalla de bloqueo ----------
let overlay = null;
let lastActive = Date.now();
let hiddenAt = null;
let idleTimer = null;
let onForgotHandler = null;

/** Qué hacer si el docente olvida el PIN (lo define app.js según haya sesión o no). */
export const setForgotHandler = (fn) => { onForgotHandler = fn; };
export const isLocked = () => !!overlay;

function setContentHidden(hidden) {
  document.documentElement.classList.toggle('is-locked', hidden);
  for (const id of ['sidebar', 'main', 'bottom-nav']) {
    const el = document.getElementById(id);
    if (!el) continue;
    if (hidden) { el.setAttribute('inert', ''); el.setAttribute('aria-hidden', 'true'); }
    else { el.removeAttribute('inert'); el.removeAttribute('aria-hidden'); }
  }
  // Cierra paneles abiertos para que no queden visibles por encima
  if (hidden) document.querySelectorAll('.overlay').forEach((o) => o.remove());
}

export function lockNow() {
  if (!isLockEnabled() || overlay) return;
  setContentHidden(true);
  overlay = buildOverlay();
  document.body.append(overlay);
  if (hasBiometric()) setTimeout(() => overlay?.querySelector('.lock-bio')?.click(), 250);
}

function unlock() {
  resetFails();
  overlay?.remove(); overlay = null;
  setContentHidden(false);
  lastActive = Date.now();
}

function buildOverlay() {
  let pin = '';
  let busy = false;
  const dots = h('div', { class: 'lock-dots', 'aria-hidden': 'true' });
  const msg = h('p', { class: 'lock-msg', role: 'status', 'aria-live': 'polite' });
  const live = h('span', { class: 'sr-only', 'aria-live': 'polite' });

  const paint = () => {
    dots.replaceChildren(...Array.from({ length: 6 }, (_, i) => h('span', { class: `lock-dot${i < pin.length ? ' on' : ''}${i >= 4 ? ' opt' : ''}` })));
    live.textContent = `${pin.length} cifras introducidas`;
  };
  const waitLeft = () => Math.max(0, Math.ceil((fails().until - Date.now()) / 1000));

  const tryPin = async () => {
    if (busy || pin.length < 4) return;
    const wait = waitLeft();
    if (wait) { msg.textContent = `Demasiados intentos. Espera ${wait} s.`; return; }
    busy = true;
    const ok = await verifyPin(pin);
    busy = false;
    if (ok) { unlock(); return; }
    const f = registerFail();
    pin = ''; paint();
    card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake');
    msg.textContent = f.until > Date.now() ? `PIN incorrecto. Espera ${waitLeft()} s.` : 'PIN incorrecto.';
  };
  // Con 4 cifras se intenta si el PIN es de 4; si no, se espera a "OK" o a la 6.ª cifra.
  const press = (d) => {
    if (pin.length >= 6) return;
    pin += d; msg.textContent = ''; paint();
    const len = readCfg()?.pinLength;
    if ((len && pin.length === len) || pin.length === 6) tryPin();
  };
  const back = () => { pin = pin.slice(0, -1); paint(); };

  const key = (label, onclick, extra = {}) => h('button', { type: 'button', class: 'lock-key', onclick, ...extra }, label);
  const pad = h('div', { class: 'lock-pad' },
    ...['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => key(d, () => press(d))),
    hasBiometric()
      ? key(icon('fingerprint', 24), async () => {
        try { if (await verifyBiometric()) unlock(); } catch { msg.textContent = 'Usa tu PIN.'; }
      }, { class: 'lock-key lock-bio', 'aria-label': 'Desbloquear con huella o Face ID' })
      : h('span'),
    key('0', () => press('0')),
    key(icon('backspace', 22), back, { 'aria-label': 'Borrar última cifra' }));

  const forgot = h('button', { type: 'button', class: 'link-btn lock-forgot', onclick: () => onForgotHandler && onForgotHandler(card) }, '¿Has olvidado el PIN?');
  const ok = h('button', { type: 'button', class: 'btn btn-primary lock-ok', onclick: tryPin }, 'Desbloquear');

  const card = h('div', { class: 'lock-card' },
    h('div', { class: 'brand-mark lock-mark' }, icon('logo', 22)),
    h('h1', { class: 'lock-title', id: 'lock-title' }, 'Tabula está bloqueada'),
    h('p', { class: 'lock-sub' }, 'Introduce tu PIN'),
    dots, live, msg, pad, ok, forgot);

  const el = h('div', { class: 'lock-screen', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'lock-title' }, card);
  el.addEventListener('keydown', (e) => {
    if (/^\d$/.test(e.key)) { e.preventDefault(); press(e.key); }
    else if (e.key === 'Backspace') { e.preventDefault(); back(); }
    else if (e.key === 'Enter') { e.preventDefault(); tryPin(); }
  });
  el.tabIndex = -1;
  paint();
  setTimeout(() => el.focus(), 30);
  return el;
}

/** Arranca el bloqueo: bloquea si está activo y vigila inactividad. */
export function initLock() {
  if (isLockEnabled()) lockNow();
  else document.documentElement.classList.remove('is-locked');

  const bump = () => { lastActive = Date.now(); };
  ['pointerdown', 'keydown', 'scroll', 'touchstart'].forEach((ev) => window.addEventListener(ev, bump, { passive: true, capture: true }));

  document.addEventListener('visibilitychange', () => {
    if (!isLockEnabled()) return;
    if (document.hidden) hiddenAt = Date.now();
    else if (hiddenAt !== null) {
      const away = Date.now() - hiddenAt; hiddenAt = null;
      if (away >= lockTimeout() * 60000) lockNow();
    }
  });
  clearInterval(idleTimer);
  idleTimer = setInterval(() => {
    const t = lockTimeout();
    if (isLockEnabled() && !overlay && !document.hidden && t > 0 && Date.now() - lastActive >= t * 60000) lockNow();
  }, 15000);
}

/** Restablece el bloqueo tras borrar los datos (PIN olvidado). */
export function resetLock() { writeCfg(null); resetFails(); }
