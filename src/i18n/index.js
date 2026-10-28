import fr from './fr.json';

/**
 * Translation lookup. Only French ships for now, but every user-facing
 * string goes through `t` so adding a language is a matter of adding a JSON
 * file and calling `setLocale`.
 */
const locales = { fr };
let current = fr;

export function setLocale(code) {
  if (!locales[code]) throw new Error(`Langue non disponible : ${code}`);
  current = locales[code];
}

export function t(key, params) {
  let s = current[key] ?? fr[key] ?? key;
  if (params) s = s.replace(/\{(\w+)\}/g, (m, k) => (params[k] !== undefined ? String(params[k]) : m));
  return s;
}
