"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");
const { test } = require("node:test");

// HOME aislado ANTES de requerir render/skills (cachean ~ al cargar).
// En Windows os.homedir() usa USERPROFILE, no HOME → espejamos el tmp en los dos.
process.env.HOME = process.env.USERPROFILE = fs.mkdtempSync(path.join(os.tmpdir(), "hermad-optskills-home-"));

const render = require("../src/lib/render");
const prompts = require("../src/lib/prompts");

function tmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}
function capture(fn) {
  const logs = [];
  const orig = console.log;
  console.log = (m) => logs.push(String(m));
  try {
    return { out: fn(), logs };
  } finally {
    console.log = orig;
  }
}
function makeSkill(dir, name) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "SKILL.md"), `---\nname: ${name}\ndescription: x\n---\nbody\n`);
}

test("loadPersona separa skills requeridas de optionalSkills", () => {
  const dev = prompts.loadPersona("dev");
  assert.deepEqual(dev.skills, [], "las BMad no son requeridas (arranca sin BMad)");
  assert.deepEqual(dev.optionalSkills, ["bmad-agent-dev", "bmad-build", "impeccable", "ui-ux-pro-max", "google-design-md", "animate", "improve-animations", "ask-sonner", "pick-ui-library", "baseline-ui", "fixing-accessibility", "fixing-motion-performance", "fixing-metadata", "context7-mcp", "find-docs", "fix-security-vulnerabilities-with-strix", "mobile-native", "animate-expo", "write-swift", "context7-cli", "ci-security-scanning-with-strix", "ui-styling"]);
  assert.deepEqual(prompts.loadPersona("reader").optionalSkills, []);
});

test("optionalSkills ausentes: 0 warnings y fuera de la allowlist", () => {
  const dir = tmp("hermad-optskills-absent-");
  const { out, logs } = capture(() => render.renderPersona({ projectDir: dir, name: "dev", persona: { kind: "claude", rol: "dev" } }));
  assert.deepEqual(logs.filter((l) => l.includes("[!] skill")), [], "BMad ausente no debe avisar");
  assert.ok(!out.skillsAllow.includes("bmad-agent-dev"));
  assert.ok(!out.skillsAllow.includes("bmad-build"));
});

test("optionalSkills presentes entran en la allowlist, sin warning por las ausentes", () => {
  const dir = tmp("hermad-optskills-present-");
  makeSkill(path.join(dir, ".claude", "skills", "bmad-build"), "bmad-build");
  const { out, logs } = capture(() => render.renderPersona({ projectDir: dir, name: "dev", persona: { kind: "claude", rol: "dev" } }));
  assert.ok(out.skillsAllow.includes("bmad-build"), "instalada → allowlist");
  assert.ok(out.skillsFound.includes("bmad-build"), "claude la carga nativa");
  assert.equal(logs.filter((l) => l.includes("bmad-agent-dev")).length, 0, "la opcional ausente sigue en silencio");
});

test("una skill requerida ausente sí avisa y nunca aborta (FR-1.3)", () => {
  const dir = tmp("hermad-optskills-req-");
  const { logs } = capture(() =>
    render.renderPersona({ projectDir: dir, name: "dev", persona: { kind: "opencode", rol: "dev", skills: ["definitely-missing-xyz"] } })
  );
  assert.equal(logs.filter((l) => l.includes("definitely-missing-xyz")).length, 1);
});

test("el prompt embebe el método y cita bmad-* como enriquecimiento opcional", () => {
  const dir = tmp("hermad-optskills-method-");
  const art = render.renderPersona({ projectDir: dir, name: "dev", persona: { kind: "opencode", rol: "dev" } });
  const md = fs.readFileSync(art.promptFile, "utf8");
  assert.match(md, /## Method \(self-contained — BMad is optional\)/);
  assert.match(md, /clarify → spec → stories → build → review/);
  assert.match(md, /bmad-agent-dev/);
  assert.match(md, /optional enrichment/);
});
