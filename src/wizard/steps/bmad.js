"use strict";
// Paso 6 — BMad (opcional) (ux §7). Solo guarda la preferencia `bmad.autoInstall`
// con el idioma elegido; no instala nada ahora (eso es create-project). Default No.
const { checkCancel } = require("../../lib/prompt");

async function collect(ctx, ui) {
  const tr = ctx.t;
  if (ctx.hasBmad()) {
    await ui.note(tr("bmad.detected"));
    ctx.bmad = { ...ctx.config.bmad };
    return;
  }
  const language = ctx.lang === "es" ? "español" : "English";
  await ui.note(tr("bmad.body", { language }));
  const yes = checkCancel(ui, await ui.confirm({ key: "bmad", message: tr("bmad.title"), defaultValue: false }));
  ctx.bmad = { ...ctx.config.bmad, autoInstall: Boolean(yes) };
}

module.exports = { collect };
