"use strict";
const assert = require("assert");
const { test } = require("node:test");
const { loadPersona } = require("../src/lib/prompts");

// Las skills BMad se declaran como optionalSkills: cada persona arranca y opera
// sin BMad instalado (FR-1.2). Skill borrada a mano → este test rompe.
const OPTIONAL = {
  analyst: ["bmad-agent-analyst", "bmad-brainstorming", "find-docs"],
  architect: ["bmad-agent-architect", "bmad-architecture", "diagram-design", "context7-mcp", "find-docs", "agent-skills-spec", "context7-cli"],
  dev: ["bmad-agent-dev", "bmad-build", "impeccable", "ui-ux-pro-max", "google-design-md", "animate", "improve-animations", "ask-sonner", "pick-ui-library", "baseline-ui", "fixing-accessibility", "fixing-motion-performance", "fixing-metadata", "context7-mcp", "find-docs", "fix-security-vulnerabilities-with-strix", "mobile-native", "animate-expo", "write-swift", "context7-cli", "ci-security-scanning-with-strix", "ui-styling"],
  orquestador: ["bmad-spec"],
  pm: ["bmad-agent-pm", "bmad-prd", "bmad-create-epics-and-stories", "diagram-design", "frontend-slides", "slides"],
  reader: [],
  security: ["penetration-testing-with-strix", "web-app-penetration-testing", "api-security-testing", "managed-pentesting-with-strix", "find-security-vulnerabilities-in-code", "owasp-top-10-testing", "application-security-testing", "ci-security-scanning-with-strix", "fix-security-vulnerabilities-with-strix"],
  reviewer: ["bmad-code-review", "bmad-review", "impeccable", "google-design-md", "emil-design-eng", "review-animations", "break-ui", "baseline-ui", "fixing-accessibility", "fixing-motion-performance", "fixing-metadata", "find-security-vulnerabilities-in-code", "owasp-top-10-testing", "application-security-testing"],
  ux: ["bmad-agent-ux-designer", "bmad-ux", "impeccable", "ui-ux-pro-max", "google-design-md", "awesome-design-md", "diagram-design", "frontend-slides", "emil-design-eng", "animation-vocabulary", "find-animation-opportunities", "apple-design", "pick-ui-library", "prototype", "improve-ui", "create-design-md", "baseline-ui", "mobile-native", "ui-skills-root", "design-system", "brand", "banner-design", "design", "slides", "ui-styling"],
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
