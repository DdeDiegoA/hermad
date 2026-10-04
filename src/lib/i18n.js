"use strict";
// i18n del wizard: es/en, sin deps. `t(lang, key, vars)` interpola `{x}`.
// El resto del CLI sigue en su idioma histórico; solo el wizard usa esto (FR-3.5).
const es = require("../i18n/es");
const en = require("../i18n/en");

const DICTS = { es, en };
const LANGS = Object.keys(DICTS);
const FALLBACK = "en";

// {x} → vars.x; clave ausente en vars queda literal (no rompe la pantalla).
function interpolate(str, vars) {
  if (!vars) return str;
  return String(str).replace(/\{(\w+)\}/g, (m, k) => (vars[k] === undefined || vars[k] === null ? m : String(vars[k])));
}

function dict(lang) {
  return DICTS[lang] || DICTS[FALLBACK];
}

// Traducción con fallback: idioma desconocido o clave faltante → en; y si tampoco
// existe, devuelve la clave (visible en la pantalla, no un `undefined`).
function t(lang, key, vars) {
  const d = dict(lang);
  let s = Object.prototype.hasOwnProperty.call(d, key) ? d[key] : DICTS[FALLBACK][key];
  if (s === undefined) s = key;
  return interpolate(s, vars);
}

// Atajo para los pasos del wizard: `const tr = translator(ctx.lang)`.
function translator(lang) {
  return (key, vars) => t(lang, key, vars);
}

module.exports = { DICTS, LANGS, FALLBACK, dict, t, translator, interpolate };
