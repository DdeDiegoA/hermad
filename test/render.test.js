"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");
const { test } = require("node:test");

// HOME aislado ANTES de requerir skills/render (cachean ~ al cargar).
// En Windows os.homedir() usa USERPROFILE, no HOME → espejamos el tmp en los dos.
process.env.HOME = process.env.USERPROFILE = fs.mkdtempSync(path.join(os.tmpdir(), "hermad-render-home-"));
const render = require("../src/lib/render");
const memory = require("../src/lib/memory");

test("claude/opencode no duplican AGENTS.md; opencode sí recibe el journal", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hermad-render-"));
  fs.writeFileSync(path.join(dir, "AGENTS.md"), "# AGENTS\nmemoria compartida");
  memory.append(dir, { agent: "dev", text: "journal-dev-only", forPersona: "dev" });
  const a = render.renderPersona({ projectDir: dir, name: "dev", persona: { kind: "claude", rol: "dev" } });

  assert.doesNotMatch(fs.readFileSync(a.promptFile, "utf8"), /memoria compartida/, "claude la recibe por CLAUDE.md + hook");
  assert.match(a.promptBody, /memoria compartida/, "el fallback (hermes/codex) sí embebe el bloque");

  const opencode = fs.readFileSync(a.opencode.agentFile, "utf8");
  assert.doesNotMatch(opencode, /memoria compartida/, "AGENTS.md no se duplica (opencode lo lee nativo)");
  assert.match(opencode, /journal-dev-only/, "opencode recibe el journal embebido");
});

test("deja /hermad y /hermad:orchestrate en el proyecto y define HERMAD_AGENT", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hermad-render-"));
  render.ensureCommands(dir);
  assert.ok(fs.existsSync(path.join(dir, ".claude", "commands", "hermad.md")));
  assert.ok(fs.existsSync(path.join(dir, ".claude", "commands", "hermad", "orchestrate.md")));

  const a = render.renderPersona({ projectDir: dir, name: "orquestador", agentName: "orquestador", persona: { kind: "claude", rol: "orch" } });
  const settings = JSON.parse(fs.readFileSync(a.claude.settingsFile, "utf8"));
  assert.equal(settings.env.HERMAD_AGENT, "orquestador");
});

test("todo agente arranca con bypass de permisos por vendor", () => {
  const vendors = require("../src/lib/vendors");
  const artifacts = { skillsFound: [], promptFile: "/p.md", promptBody: "x", claude: { pluginDir: "/d", settingsFile: "/s.json" }, opencode: { agentName: "hermad-dev" } };
  const persona = { modelFlag: "--model sonnet" };
  for (const kind of ["claude", "opencode", "hermes", "codex", "gemini"]) {
    const { args } = vendors.startPlan(kind, "dev", persona, artifacts);
    for (const flag of vendors.BYPASS_ARGS[kind]) assert.ok(args.includes(flag), `${kind} sin ${flag}`);
  }
});

test("claude niega las skills del proyecto (.claude/skills) — la allowlist va por el plugin", () => {
  const render = require("../src/lib/render");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hermad-deny-"));
  for (const n of ["bmad-prd", "bmad-build"]) {
    fs.mkdirSync(path.join(dir, ".claude", "skills", n), { recursive: true });
    fs.writeFileSync(path.join(dir, ".claude", "skills", n, "SKILL.md"), `---\nname: ${n}\ndescription: x\n---\nbody\n`);
  }
  const a = render.renderPersona({ projectDir: dir, name: "dev", persona: { kind: "claude", modelFlag: "--model haiku", rol: "dev" } });
  const deny = JSON.parse(fs.readFileSync(a.claude.settingsFile, "utf8")).permissions.deny;
  assert.ok(deny.includes("Skill(bmad-prd)") && deny.includes("Skill(bmad-build)"), JSON.stringify(deny));
  assert.ok(a.skillsFound.includes("bmad-build"), "bmad-build sigue permitida vía plugin");
});

test("claude no usa subagentes internos: Agent/Task deny + regla, opencode no la recibe", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hermad-subagent-"));
  const claude = render.renderPersona({ projectDir: dir, name: "pm", persona: { kind: "claude", rol: "pm" } });
  const deny = JSON.parse(fs.readFileSync(claude.claude.settingsFile, "utf8")).permissions.deny;
  assert.ok(deny.includes("Agent") && deny.includes("Task"), JSON.stringify(deny));
  assert.match(fs.readFileSync(claude.promptFile, "utf8"), /Internal subagents are DISABLED/);

  const opencode = render.renderPersona({ projectDir: dir, name: "dev", persona: { kind: "opencode", rol: "dev" } });
  assert.doesNotMatch(fs.readFileSync(opencode.promptFile, "utf8"), /Internal subagents are DISABLED/);
});
