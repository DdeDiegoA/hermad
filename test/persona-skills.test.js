"use strict";
const assert = require("assert");
const { test } = require("node:test");
const { loadPersona } = require("../src/lib/prompts");

// Las skills BMad se declaran como optionalSkills: cada persona arranca y opera
// sin BMad instalado (FR-1.2). Skill borrada a mano → este test rompe.
const OPTIONAL = {
  analyst: ["bmad-agent-analyst", "bmad-brainstorming"],
  architect: ["bmad-agent-architect", "bmad-architecture"],
  dev: ["bmad-agent-dev", "bmad-build"],
  orquestador: ["bmad-spec"],
  pm: ["bmad-agent-pm", "bmad-prd", "bmad-create-epics-and-stories"],
  reader: [],
  reviewer: ["bmad-code-review", "bmad-review"],
  ux: ["bmad-agent-ux-designer", "bmad-ux"],
};

test("cada persona declara sus skills BMad como opcionales (nada requerido)", () => {
  for (const [persona, optional] of Object.entries(OPTIONAL)) {
    const p = loadPersona(persona);
    assert.ok(p, `falta templates/prompts/${persona}.md`);
    assert.deepEqual(p.optionalSkills, optional, persona);
    assert.deepEqual(p.skills, [], `${persona}: sin skills requeridas (no bloquea sin BMad)`);
  }
});

test("`skills: []` parsea a lista vacía (reader)", () => {
  assert.deepEqual(loadPersona("reader").skills, []);
});
