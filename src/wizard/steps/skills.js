"use strict";
// Paso 4 — Skills (ux §5). Indexa las skills instaladas y propone globales + por
// persona. El LLM solo con consentimiento (default No); si no, matcher local
// (privacidad por defecto, NFR-5). Es saltable: cero skills propias es válido y
// no genera warnings (FR-2.5). No persiste nada: el apply lo hace setup.
const discovery = require("../../lib/discovery");
const pack = require("../../lib/pack");
const prompts = require("../../lib/prompts");
const vendors = require("../../lib/vendors");
const { modelIdFrom } = require("../../lib/render");
const { checkCancel } = require("../../lib/prompt");

// El pack base (herdr-bmad) queda enlazado en el filesystem del vendor: NO es una
// skill del usuario y no debe entrar en las propuestas (si no, un re-run del
// wizard la "descubre" y cambia la config — rompe la idempotencia A9).
// pack.isPackSkill centraliza esa regla (misma que usa `hermad skills suggest`).

function modelLabel(ctx, vendor) {
  const id = modelIdFrom((ctx.personas.orquestador || {}).modelFlag || "");
  if (id) return id;
  return ctx.lang === "es" ? `el modelo por defecto de ${vendor}` : `${vendor}'s default model`;
}

function consentNote(ctx, vendor, n) {
  const tr = ctx.t;
  const model = modelLabel(ctx, vendor);
  return [tr("skills.consent.body", { vendor, model }), "", tr("skills.consent.sent", { n }), tr("skills.consent.notsent"), tr("skills.consent.dest", { vendor, model }), "", tr("skills.consent.local")].join("\n");
}

function options(entries, descOf) {
  return entries.map((o) => ({ value: o.name, label: o.name, hint: o.reason || descOf.get(o.name) }));
}

async function collect(ctx, ui) {
  const tr = ctx.t;
  const keep = { globalSkills: ctx.config.globalSkills || [], personaSkills: ctx.config.personaSkills || {} };

  if (ctx.flags.skipSkills) {
    ctx.skills = { ...keep, skipped: true };
    return;
  }

  const list = ctx.listInstalled(ctx.projectDir).filter((s) => !pack.isPackSkill(s.dir, ctx.home));
  if (!list.length) {
    await ui.note(tr("skills.none"));
    // Sin skills propias no se pisa lo ya guardado (NFR-8).
    ctx.skills = { globalSkills: keep.globalSkills, personaSkills: keep.personaSkills, none: true };
    return;
  }

  const personas = Object.keys(ctx.personas);
  // Cuerpo completo para el matcher LOCAL (no sale de la máquina) y solo el rol
  // en una línea para el LLM (nunca el cuerpo — decisión de seguridad).
  const personaBodies = {};
  const personaRoles = {};
  for (const p of personas) {
    personaBodies[p] = (prompts.loadPersona(p) || {}).body || (ctx.personas[p] || {}).rol || "";
    personaRoles[p] = (ctx.personas[p] || {}).rol || "";
  }

  const vendor = (ctx.personas.orquestador || {}).kind || ctx.vendors[0];
  let consent = Boolean(ctx.flags.llmSuggest);
  if (!consent && ui.mode !== "headless") {
    await ui.note(consentNote(ctx, vendor, list.length), tr("skills.consent.title"));
    consent = checkCancel(ui, await ui.confirm({ key: "skills", flag: "--llm-suggest", message: tr("skills.consent.ask", { vendor }), defaultValue: false }));
  }
  const canLLM = consent && vendor !== "hermes" && !vendors.isExperimental(vendor);
  if (consent && !canLLM) await ui.note(tr("skills.consent.unavailable", { vendor }));

  const res = discovery.suggest({
    list,
    personas,
    personaBodies,
    personaRoles,
    vendor,
    model: modelIdFrom((ctx.personas.orquestador || {}).modelFlag || ""),
    consent: canLLM,
    globals: keep.globalSkills,
    callVendor: ctx.callVendor,
  });
  for (const w of res.warnings) await ui.note(`${tr("skills.source.local")}: ${w}`);
  if (list.length > discovery.MANY) await ui.note(tr("skills.showing", { n: list.length }));

  const descOf = new Map(list.map((s) => [s.id, s.description]));
  const globalSelected = checkCancel(
    ui,
    await ui.multiselect({ key: "skills", message: tr("skills.global.title"), options: options(res.global, descOf), defaultValue: res.global.filter((o) => o.selected).map((o) => o.name) })
  );

  const personaSkills = {};
  for (const p of personas) {
    const entries = res.byPersona[p] || [];
    if (!entries.length) continue;
    const picked = checkCancel(
      ui,
      await ui.multiselect({ key: "skills", message: tr("skills.persona.title", { persona: p }), options: options(entries, descOf), defaultValue: entries.filter((o) => o.selected).map((o) => o.name) })
    );
    if (picked.length) personaSkills[p] = picked;
  }

  // discovery ya no propone las globales vigentes: el wizard las conserva para
  // que un re-run no las borre (A9).
  ctx.skills = { globalSkills: [...new Set([...keep.globalSkills, ...globalSelected])], personaSkills, source: res.source };
}

module.exports = { collect, consentNote, modelLabel };
