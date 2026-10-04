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

test("Find.1: el consentimiento declara los roles que discovery sí envía (en y es)", () => {
  const personas = { orquestador: { modelFlag: "" } };
  const en = skillsStep.consentNote({ lang: "en", t: translator("en"), personas }, "claude", 2);
  const es = skillsStep.consentNote({ lang: "es", t: translator("es"), personas }, "claude", 2);
  assert.match(en, /role text/i);
  assert.match(es, /texto del rol/i);
  // lo que se declara debe existir en el prompt real
  const prompt = discovery.buildLLMPrompt({ list: [{ id: "x", description: "d" }], personas: ["dev"], personaBodies: { dev: "builder" } });
  assert.match(prompt, /Roles:/);
  assert.match(prompt, /- dev: builder/);
});
