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

function makeSkill(dir, name, description = "x") {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "SKILL.md"), `---\nname: ${name}\ndescription: ${description}\n---\nbody\n`);
}

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

test("render separa skills nativas de por-ruta según el vendor (agentName keyea los artefactos)", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hermad-split-"));
  const home = process.env.HOME;
  makeSkill(path.join(dir, ".claude", "skills", "proj-skill"), "proj-skill", "proyecto");
  makeSkill(path.join(home, ".claude", "plugins", "cache", "mp", "superpowers", "1.0.0", "skills", "tdd"), "tdd", "plugin claude");
  makeSkill(path.join(home, ".config", "opencode", "skills", "oc-skill"), "oc-skill", "opencode");

  // claude: TODO nativo (el plugin symlinkea cualquier fuente) → sin bloque de rutas
  const claude = render.renderPersona({ projectDir: dir, name: "dev", agentName: "architect", persona: { kind: "claude", rol: "x" }, extraSkills: ["superpowers:tdd", "proj-skill"] });
  assert.deepEqual(claude.skillsByPath, []);
  assert.ok(claude.promptFile.endsWith(path.join("generated", "prompts", "architect.md")));
  assert.ok(fs.existsSync(path.join(dir, ".hermad", "generated", "claude", "architect", ".claude-plugin", "plugin.json")));
  assert.doesNotMatch(fs.readFileSync(claude.promptFile, "utf8"), /## Task skills/);

  // opencode: plugin claude y hermes NO nativas; .claude/skills del proyecto y sus roots SÍ
  const oc = render.renderPersona({ projectDir: dir, name: "dev", agentName: "architect-2", persona: { kind: "opencode", rol: "x" }, extraSkills: ["superpowers:tdd", "proj-skill", "oc-skill"] });
  const byName = oc.skillsByPath.map((s) => s.name);
  assert.ok(byName.includes("superpowers:tdd"), "plugin claude no es nativa de opencode");
  assert.ok(!byName.includes("proj-skill") && !byName.includes("oc-skill"), "las de opencode/proyecto sí son nativas");
  const prom = fs.readFileSync(oc.promptFile, "utf8");
  assert.match(prom, /## Task skills/);
  assert.ok(prom.includes(path.join(home, ".claude", "plugins", "cache", "mp", "superpowers", "1.0.0", "skills", "tdd", "SKILL.md")));
  assert.ok(oc.promptFile.endsWith(path.join("generated", "prompts", "architect-2.md")), "no pisa al architect");
  assert.ok(fs.existsSync(path.join(dir, ".opencode", "agents", "hermad-architect-2.md")));

  // hermes: solo sus roots nativas; el resto por ruta; skillsFound = nativas
  const hermes = render.renderPersona({ projectDir: dir, name: "dev", agentName: "hermes-dev", persona: { kind: "hermes", rol: "x" }, extraSkills: ["oc-skill"] });
  assert.deepEqual(hermes.skillsByPath.map((s) => s.name), ["oc-skill"]);
  assert.deepEqual(hermes.skillsFound, []);
  assert.match(fs.readFileSync(hermes.promptFile, "utf8"), /## Task skills/);
});

test("globales efectivas y --skills entran en la allowlist sin duplicados", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hermad-allow-"));
  const a = render.renderPersona({ projectDir: dir, name: "ghost", persona: { kind: "opencode", rol: "x" }, globs: ["gskill"], extraSkills: ["gskill", "extra"] });
  assert.deepEqual(a.skillsAllow, ["gskill", "extra"], "dedupe frontmatter ∪ globales ∪ --skills");
});
