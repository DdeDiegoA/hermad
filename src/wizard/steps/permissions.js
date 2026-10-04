"use strict";
// Paso 5 — Permisos ⚠️ (ux §6, gate de seguridad). Pantalla completa del riesgo
// (incluida la última frase "Puedes cambiarlo cuando quieras…"), después la
// pregunta con default "con permisos" y, solo si eligió bypass, una segunda
// confirmación con default No. `--accept-bypass` imprime la misma pantalla y
// aplica bypass; `--yes` NUNCA implica bypass (D6).
const { checkCancel } = require("../../lib/prompt");

// Claves del copy §6.2 en orden; la última es la frase de "cómo cambiarlo".
const RISK_KEYS = ["perm.title", "perm.intro", "perm.prompt.head", "perm.prompt.body", "perm.prompt.cost", "perm.bypass.head", "perm.bypass.body", "perm.change"];

function riskText(tr) {
  return RISK_KEYS.map((k) => tr(k)).join("\n\n");
}

async function collect(ctx, ui) {
  const tr = ctx.t;
  await ui.note(riskText(tr));

  if (ctx.flags.acceptBypass) {
    // Non-interactivo: la pantalla de riesgo ya se imprimió arriba.
    ctx.permissions = { mode: "bypass", acceptedAt: new Date().toISOString() };
    return;
  }

  const picked = checkCancel(
    ui,
    await ui.select({
      key: "permissions",
      flag: "--accept-bypass",
      message: tr("perm.ask"),
      options: [
        { value: "prompt", label: tr("perm.opt.prompt") },
        { value: "bypass", label: tr("perm.opt.bypass") },
      ],
      defaultValue: "prompt",
    })
  );

  if (picked === "bypass") {
    const accepted = checkCancel(ui, await ui.confirm({ key: "permissions", flag: "--accept-bypass", message: tr("perm.confirm.ask"), defaultValue: false }));
    if (accepted) {
      ctx.permissions = { mode: "bypass", acceptedAt: new Date().toISOString() };
      return;
    }
    await ui.note(tr("perm.kept"));
  }
  ctx.permissions = { mode: "prompt", acceptedAt: null };
}

module.exports = { collect, riskText, RISK_KEYS };
