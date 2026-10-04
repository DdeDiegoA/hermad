"use strict";
// Paso 1 — Idioma (ux §2). Único paso bilingüe antes de elegir. Default = locale
// (`LANG`/`LC_*`/Intl empieza con `es` → es). `--lang` lo salta.
const { translator } = require("../../lib/i18n");
const { checkCancel } = require("../../lib/prompt");

const OPTIONS = [
  { value: "es", label: "Español" },
  { value: "en", label: "English" },
];

function detectLocale(env = process.env, intl = typeof Intl !== "undefined" ? Intl : null) {
  let raw = env.LC_ALL || env.LC_MESSAGES || env.LANG || "";
  if (!raw && intl && intl.DateTimeFormat) {
    try {
      raw = intl.DateTimeFormat().resolvedOptions().locale || "";
    } catch {
      raw = "";
    }
  }
  return /^es/i.test(String(raw)) ? "es" : "en";
}

async function collect(ctx, ui) {
  if (ctx.flags.lang) {
    ctx.lang = ctx.flags.lang === "es" ? "es" : "en";
  } else {
    const picked = await ui.select({ key: "language", flag: "--lang", message: "Idioma / Language", options: OPTIONS, defaultValue: ctx.locale });
    ctx.lang = checkCancel(ui, picked) === "es" ? "es" : "en";
  }
  ctx.t = translator(ctx.lang);
  await ui.note(ctx.t("language.note"));
}

module.exports = { collect, detectLocale, OPTIONS };
