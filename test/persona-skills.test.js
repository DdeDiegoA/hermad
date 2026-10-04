"use strict";
const assert = require("assert");
const { test } = require("node:test");
const { loadPersona } = require("../src/lib/prompts");

// Skills globales (herdr-bmad, graphify) viven en ~/.hermad/config.json, no en
// el frontmatter. Cada persona lista SOLO lo suyo. Skill borrada a mano → este
// test rompe.
const EXPECTED = {
  analyst: ["bmad-agent-analyst", "bmad-brainstorming"],
  architect: ["bmad-agent-architect", "bmad-architecture"],
  dev: ["bmad-agent-dev", "bmad-build"],
  orquestador: ["bmad-spec"],
  pm: ["bmad-agent-pm", "bmad-prd", "bmad-create-epics-and-stories"],
  reader: [],
  reviewer: ["bmad-code-review", "bmad-review"],
  ux: ["bmad-agent-ux-designer", "bmad-ux"],
};

test("el frontmatter de cada persona lista exactamente sus skills propias", () => {
  for (const [persona, skills] of Object.entries(EXPECTED)) {
    const p = loadPersona(persona);
    assert.ok(p, `falta templates/prompts/${persona}.md`);
    assert.deepEqual(p.skills, skills, persona);
  }
});

test("`skills: []` parsea a lista vacía (reader)", () => {
  assert.deepEqual(loadPersona("reader").skills, []);
});
