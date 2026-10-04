"use strict";
// Follow-up de la revisión de seguridad de HPT-SETUP (PR #10): disclosure del
// consentimiento LLM y aviso de modelo duplicado en setups multi-vendor.
const assert = require("assert");
const { test } = require("node:test");
const vendorsStep = require("../src/wizard/steps/vendors");
const skillsStep = require("../src/wizard/steps/skills");
const discovery = require("../src/lib/discovery");
const { translator, DICTS } = require("../src/lib/i18n");

function countingUI(mode = "headless") {
  const notes = [];
  return {
    mode,
    notes,
    intro: async () => {},
    outro: async () => {},
    note: async (m) => {
      notes.push(String(m));
    },
    select: async (q) => q.defaultValue,
    confirm: async (q) => q.defaultValue,
    multiselect: async (q) => q.defaultValue || [],
    text: async (q) => q.defaultValue || "",
    spinner: () => ({ start() {}, message() {}, stop() {} }),
    cancelled: () => false,
  };
}

function ctxVendors(lang = "en", vendors = ["claude", "opencode"]) {
  return {
    flags: {},
    config: { personas: { orquestador: { kind: "claude" }, dev: { kind: "claude" } } },
    vendors,
    t: translator(lang),
    lang,
  };
}

test("Find.2: el aviso de modelo se imprime una sola vez aunque haya varios vendors", async () => {
  const ui = countingUI("headless");
  await vendorsStep.collect(ctxVendors("en"), ui);
  const hits = ui.notes.filter((n) => n.includes(DICTS.en["model.note"])).length;
  assert.equal(hits, 1, `model.note impreso ${hits} veces`);
});

test("Find.2: con --model no se imprime el aviso (el usuario ya eligió)", async () => {
  const ui = countingUI("headless");
  const ctx = ctxVendors("en");
  ctx.flags = { model: "sonnet" };
  await vendorsStep.collect(ctx, ui);
  assert.ok(!ui.notes.some((n) => n.includes(DICTS.en["model.note"])));
  assert.match(ctx.personas.dev.modelFlag, /sonnet/);
});

test("Find.1: el consentimiento declara exactamente lo que se envía: nombres + rol en una línea (en y es)", () => {
  const personas = { orquestador: { modelFlag: "" } };
  const en = skillsStep.consentNote({ lang: "en", t: translator("en"), personas }, "claude", 2);
  const es = skillsStep.consentNote({ lang: "es", t: translator("es"), personas }, "claude", 2);
  assert.match(en, /one-line role/i);
  assert.match(es, /rol en una línea/i);
  // lo declarado debe ser exactamente lo que el prompt real lleva: nombre + rol, sin cuerpo
  const prompt = discovery.buildLLMPrompt({ list: [{ id: "x", description: "d" }], personas: ["dev"], personaRoles: { dev: "Amelia — build" } });
  assert.match(prompt, /Roles:/);
  assert.match(prompt, /- dev: Amelia — build/);
});

test("Find.1: al LLM no le llega el cuerpo del prompt de la persona (SEND LESS)", () => {
  const body = "You are Amelia, a senior software engineer. ".repeat(100); // ~4.6k chars
  const marker = "senior software engineer";
  let sent = "";
  discovery.suggest({
    list: [{ id: "code-review", description: "Reviews diffs for bugs" }],
    personas: ["dev"],
    personaBodies: { dev: body }, // disponible para el matcher local…
    personaRoles: { dev: "Amelia — build" }, // …pero al LLM solo le va el rol
    vendor: "claude",
    consent: true,
    callVendor: (_vendor, _model, prompt) => {
      sent = prompt;
      return JSON.stringify({ global: [], byPersona: { dev: [] }, reason: "r" });
    },
  });
  assert.ok(sent.length > 0, "el prompt debe haber llegado al vendor");
  assert.ok(!sent.includes(marker), "el cuerpo del prompt no debe salir de la máquina");
  assert.ok(!sent.includes(body));
  assert.ok(sent.length < 2000, `prompt demasiado largo (${sent.length}); ¿se coló el cuerpo?`);
  assert.match(sent, /- dev: Amelia — build/);
});
