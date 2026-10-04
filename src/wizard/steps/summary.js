"use strict";
// Paso 7 — Resumen antes de aplicar (ux §8, §14). Único punto de "no vuelta
// atrás": hasta acá no se escribió nada. Lista lo que cambia (pack + enlaces +
// config). Si es un re-run sin cambios → "Nada que cambiar" y no se aplica (A9,
// NFR-8). pack.install siempre devuelve changed:true, así que el no-op se
// detecta acá comparando el pack instalado y el plan de enlaces.
const path = require("path");
const pack = require("../../lib/pack");
const { checkCancel } = require("../../lib/prompt");

const LABELS = {
  es: { language: "idioma", permissions: "permisos", personas: "personas", skills: "skills globales", bmad: "BMad" },
  en: { language: "language", permissions: "permissions", personas: "personas", skills: "global skills", bmad: "BMad" },
};

function packUpToDate(ctx) {
  const packDir = pack.packDirFor(ctx.home);
  const rels = ["skill", path.join("command", "hermad.md"), path.join("command", "orchestrate.md")];
  return rels.every((rel) => ctx.sameTree(ctx.fs, path.join(ctx.repoRoot, rel), path.join(packDir, rel)));
}

function desiredConfig(ctx) {
  return {
    ...ctx.config,
    language: ctx.lang,
    userName: ctx.flags.userName != null ? ctx.flags.userName : ctx.config.userName,
    permissions: ctx.permissions,
    personas: ctx.personas,
    globalSkills: ctx.skills.globalSkills,
    personaSkills: ctx.skills.personaSkills,
    bmad: ctx.bmad,
  };
}

function samePersonas(a, b) {
  const names = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  for (const n of names) {
    const x = (a || {})[n] || {};
    const y = (b || {})[n] || {};
    if ((x.kind || "") !== (y.kind || "") || (x.modelFlag || "") !== (y.modelFlag || "")) return false;
  }
  return true;
}

function configChanged(current, desired) {
  const perms = current.permissions || {};
  const dp = desired.permissions || {};
  return (
    (current.language || "en") !== desired.language ||
    (current.userName || "") !== (desired.userName || "") ||
    (perms.mode || "prompt") !== (dp.mode || "prompt") ||
    String(perms.acceptedAt || "") !== String(dp.acceptedAt || "") ||
    JSON.stringify(current.globalSkills || []) !== JSON.stringify(desired.globalSkills || []) ||
    JSON.stringify(current.personaSkills || {}) !== JSON.stringify(desired.personaSkills || {}) ||
    Boolean(current.bmad && current.bmad.autoInstall) !== Boolean(desired.bmad && desired.bmad.autoInstall) ||
    !samePersonas(current.personas, desired.personas)
  );
}

function fileLines(ctx, actions) {
  const tr = ctx.t;
  const lines = [`  ~/.hermad/pack/`];
  for (const a of actions) {
    if (a.action === "ok") lines.push(`  = ${a.linkPath}`);
    else if (a.action === "skip-foreign") lines.push(`  ${tr("summary.skipped.foreign", { path: a.linkPath })}`);
    else if (a.action === "migrate") lines.push(`  + ${a.linkPath} → ${a.target} (${tr("summary.relink.replace", { path: a.reason })})`);
    else if (a.action === "overwrite") lines.push(`  ~ ${a.linkPath}`);
    else lines.push(`  + ${a.linkPath} → ${a.target}`);
  }
  return lines;
}

function configLines(ctx) {
  const L = LABELS[ctx.lang] || LABELS.en;
  const kinds = [...new Set(Object.values(ctx.personas).map((p) => `${p.kind}${p.modelFlag ? ` (${p.modelFlag})` : ""}`))];
  const perms = ctx.permissions.mode === "bypass" ? (ctx.lang === "es" ? "sin permisos (bypass)" : "no permissions (bypass)") : ctx.lang === "es" ? "con permisos" : "permission-prompt";
  const skills = ctx.skills.globalSkills.length ? ctx.skills.globalSkills.join(", ") : ctx.lang === "es" ? "ninguna" : "none";
  const bmad = ctx.bmad.autoInstall ? (ctx.lang === "es" ? "sí" : "yes") : ctx.lang === "es" ? "no por ahora" : "not for now";
  return [`  ${L.language}: ${ctx.lang}`, `  ${L.permissions}: ${perms}`, `  ${L.personas}: ${kinds.join(" · ")}`, `  ${L.skills}: ${skills}`, `  ${L.bmad}: ${bmad}`];
}

async function collect(ctx, ui) {
  const tr = ctx.t;
  const actions = ctx.packPlan({ home: ctx.home, vendors: ctx.vendors, platform: ctx.platform, repoRoot: ctx.repoRoot });
  const desired = desiredConfig(ctx);
  ctx.desiredConfig = desired;
  const nochange = packUpToDate(ctx) && actions.every((a) => a.action === "ok") && !configChanged(ctx.config, desired);
  ctx.nochange = nochange;

  if (nochange) {
    await ui.note(tr("summary.nochange"));
    ctx.apply = false;
    return;
  }

  const block = [tr("summary.config"), ...configLines(ctx), "", tr("summary.files"), ...fileLines(ctx, actions)].join("\n");
  await ui.note(block, tr("summary.title"));
  ctx.apply = checkCancel(ui, await ui.confirm({ key: "summary", message: tr("summary.ask"), defaultValue: true }));
}

module.exports = { collect, packUpToDate, desiredConfig, configChanged, fileLines, configLines };
