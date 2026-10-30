// Tabula · cifrado de la sección Códigos (lógica pura con WebCrypto; funciona igual en el navegador y en Node).
// La clave la elige el docente y nunca se guarda: de ella se deriva (PBKDF2-SHA256) una llave AES-GCM de 256 bits.
// En la cuenta solo queda { salt, iterations, check } (ajuste 'codigosCifrado') y cada código como { iv, ct } en base64.

const ITER = 250000;
const enc = new TextEncoder();
const dec = new TextDecoder();
const CHECK = 'tabula-codigos-ok';
const b64 = (u8) => btoa(String.fromCharCode(...u8));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export const validPassphrase = (p) => typeof p === 'string' && p.length >= 8;

/** Llave AES-GCM a partir de la clave y la sal. */
export async function deriveKey(passphrase, salt, iterations = ITER) {
  const base = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: unb64(salt), iterations, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function encryptText(key, text) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(String(text ?? ''))));
  return { iv: b64(iv), ct: b64(ct) };
}

/** Descifra; lanza un error si la llave no es la correcta o el dato está alterado. */
export async function decryptText(key, box) {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(box.iv) }, key, unb64(box.ct));
  return dec.decode(pt);
}

/** Configuración nueva para una clave: { salt, iterations, check } y la llave ya derivada. */
export async function newVault(passphrase) {
  if (!validPassphrase(passphrase)) throw new Error('La clave debe tener al menos 8 caracteres.');
  const salt = b64(crypto.getRandomValues(new Uint8Array(16)));
  const key = await deriveKey(passphrase, salt);
  return { cfg: { salt, iterations: ITER, check: await encryptText(key, CHECK) }, key };
}

/** Comprueba la clave contra la configuración guardada. Devuelve la llave o null si no es correcta. */
export async function openVault(cfg, passphrase) {
  try {
    const key = await deriveKey(passphrase, cfg.salt, cfg.iterations || ITER);
    return (await decryptText(key, cfg.check)) === CHECK ? key : null;
  } catch { return null; }
}
