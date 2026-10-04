"use strict";
// Paso 3 — Vendors y modelo (ux §4). Un solo vendor = nota, sin pregunta
// (FR-4.1). Varios = propuesta por persona + confirmación (FR-4.2). El modelo
// SIEMPRE lo elige el usuario o llega por `--model`; nunca un default silencioso
// (FR-4.3). codex/gemini son experimentales y nunca vienen preseleccionados.
const vendors = require("../../lib/vendors");
const { checkCancel } = require("../../lib/prompt");

const TOP = ["orquestador", "architect", "pm"];

// Propuesta por defecto: el orquestador y los roles de producto al primer vendor
// estable, el resto al segundo (design §3).
function proposal(personas, installed) {
  const order = vendors.VENDOR_ORDER.filter((k) => installed.includes(k));
  const stable = installed.filter((k) => !vendors.isExperimental(k));
  const first = order[0] || stable[0] || installed[0];
  const second = order[1] || stable[1] || first;
  const map = {};
  for (const p of personas) map[p] = TOP.includes(p) ? first : second;
  return map;
}

function vendorOptions(installed, tr) {
  return installed.map((k) => ({ value: k, label: vendors.isExperimental(k) ? `${k} ${tr("prereqs.vendors.exp", { n: "" }).trim()}` : k }));
}

async function pickModel(ctx, ui, kind) {
  const tr = ctx.t;
  if (ctx.flags.model) return vendors.modelFlagFor(kind, ctx.flags.model);
  // ux §13: sin --model, cada vendor usa su propio default (hermad no elige). El
  // aviso lo imprime collect UNA vez (no una por vendor).
  if (ui.mode === "headless") return "";
  const models = vendors.modelsFor(kind);
  const options = [
    ...models.map((m) => ({ value: m.flag, label: m.label })),
    { value: "__other__", label: tr("model.other") },
    { value: "", label: tr("model.default", { vendor: kind }) },
  ];
  const picked = checkCancel(ui, await ui.select({ key: "model", flag: "--model", message: tr("model.ask", { vendor: kind }), options, defaultValue: "" }));
  if (picked === "__other__") {
    const typed = checkCancel(ui, await ui.text({ key: "model", flag: "--model", message: tr("model.ask", { vendor: kind }), defaultValue: "" }));
    return typed ? vendors.modelFlagFor(kind, typed) : "";
  }
  return picked || "";
}

async function collect(ctx, ui) {
  const tr = ctx.t;
  const personas = Object.keys(ctx.config.personas);
  const installed = ctx.vendors;
  let map;

  if (installed.length === 1) {
    map = Object.fromEntries(personas.map((p) => [p, installed[0]]));
    await ui.note(tr("vendors.single", { vendor: installed[0] }));
  } else {
    map = proposal(personas, installed);
    await ui.note(Object.entries(map).map(([p, v]) => `${p} → ${v}`).join("\n"), tr("vendors.split.title"));
    const ok = checkCancel(ui, await ui.confirm({ key: "vendors", message: tr("vendors.split.ask"), defaultValue: true }));
    if (!ok) {
      for (const p of personas) {
        const picked = checkCancel(
          ui,
          await ui.select({ key: "vendors", message: tr("vendors.split.edit.persona", { persona: p }), options: vendorOptions(installed, tr), defaultValue: map[p] })
        );
        map[p] = picked;
      }
    }
  }

  const kinds = [...new Set(Object.values(map))];
  // El aviso de "hermad no elige modelos" se imprime una sola vez, aunque haya
  // varios vendors (ux §13).
  if (ui.mode === "headless" && !ctx.flags.model) await ui.note(tr("model.note"));
  const modelFlags = {};
  for (const kind of kinds) modelFlags[kind] = await pickModel(ctx, ui, kind);

  ctx.personas = {};
  for (const p of personas) {
    const current = ctx.config.personas[p] || {};
    ctx.personas[p] = { kind: map[p], modelFlag: modelFlags[map[p]] || "", rol: current.rol || "" };
  }
}

module.exports = { collect, proposal };
