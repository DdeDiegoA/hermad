"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");
const { test } = require("node:test");

// HOME aislado ANTES de requerir config/render/vendors.
// En Windows os.homedir() usa USERPROFILE, no HOME → espejamos el tmp en los dos.
process.env.HOME = process.env.USERPROFILE = fs.mkdtempSync(path.join(os.tmpdir(), "hermad-perms-"));

const config = require("../src/lib/config");
const render = require("../src/lib/render");
const vendors = require("../src/lib/vendors");

function writeGlobal(permissions, extra = {}) {
  fs.mkdirSync(path.dirname(config.CONFIG_PATH), { recursive: true });
  fs.writeFileSync(config.CONFIG_PATH, JSON.stringify({ schemaVersion: 2, permissions, ...extra }));
}
function writeProject(dir, permissions) {
  fs.mkdirSync(path.join(dir, ".hermad"), { recursive: true });
  fs.writeFileSync(path.join(dir, ".hermad", "project.json"), JSON.stringify({ name: "p", permissions }));
  return dir;
}
function tmpDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}
function assertBypassFlags(kind, args) {
  for (const flag of vendors.BYPASS_ARGS[kind]) assert.ok(args.includes(flag), `${kind} debería llevar ${flag}`);
}

test("config bypass: render lo propaga y startPlan agrega los BYPASS_ARGS del vendor", () => {
  writeGlobal({ mode: "bypass", acceptedAt: "2026-01-01T00:00:00.000Z" });
  const dir = tmpDir("hermad-perm-bypass-");
  for (const kind of ["claude", "opencode", "hermes"]) {
    const a = render.renderPersona({ projectDir: dir, name: "dev", persona: { kind, modelFlag: "", rol: "dev" } });
    assert.equal(a.permissions, "bypass");
    assertBypassFlags(kind, vendors.startPlan(kind, "dev", {}, a).args);
  }
});

test("artifacts sin permissions (o desconocido) falla CERRADO: sin BYPASS_ARGS", () => {
  for (const permissions of [undefined, "weird"]) {
    const artifacts = { skillsFound: [], permissions, claude: { pluginDir: "/d", settingsFile: "/s.json" }, opencode: { agentName: "hermad-dev" } };
    for (const kind of ["claude", "opencode", "hermes", "codex", "gemini"]) {
      const { args } = vendors.startPlan(kind, "dev", {}, artifacts);
      for (const flag of vendors.BYPASS_ARGS[kind]) assert.ok(!args.includes(flag), `${kind} no debe llevar ${flag} con permissions=${permissions}`);
    }
  }
});

test("config prompt: sin flags de bypass, pero los deny explícitos siguen", () => {
  writeGlobal({ mode: "prompt", acceptedAt: null });
  const dir = tmpDir("hermad-perm-prompt-");
  for (const kind of ["claude", "opencode", "hermes"]) {
    const a = render.renderPersona({ projectDir: dir, name: "dev", persona: { kind, modelFlag: "", rol: "dev" } });
    assert.equal(a.permissions, "prompt");
    const { args } = vendors.startPlan(kind, "dev", {}, a);
    for (const flag of vendors.BYPASS_ARGS[kind]) assert.ok(!args.includes(flag), `${kind} NO debería llevar ${flag}`);
  }
  // reader es readonly: los writers quedan denegados en ambos modos.
  const reader = render.renderPersona({ projectDir: dir, name: "reader", persona: { kind: "claude", modelFlag: "", rol: "reader" } });
  assert.equal(reader.permissions, "prompt");
  const deny = JSON.parse(fs.readFileSync(reader.claude.settingsFile, "utf8")).permissions.deny;
  for (const tool of ["Edit", "Write", "NotebookEdit"]) assert.ok(deny.includes(tool), `reader readonly: falta deny ${tool}`);
});

test("el override del proyecto gana sobre la config global", () => {
  writeGlobal({ mode: "bypass", acceptedAt: null });
  const dir = writeProject(tmpDir("hermad-perm-proj-"), { mode: "prompt", acceptedAt: null });
  // sin `project` inyectado → render lee .hermad/project.json de projectDir
  const noProject = render.renderPersona({ projectDir: dir, name: "dev", persona: { kind: "claude", modelFlag: "", rol: "dev" } });
  assert.equal(noProject.permissions, "prompt", "el project.json gana sobre la global bypass");

  // el objeto project inyectado también gana
  writeGlobal({ mode: "prompt", acceptedAt: null });
  const withProject = render.renderPersona({
    projectDir: tmpDir("hermad-perm-proj2-"),
    name: "dev",
    persona: { kind: "claude", modelFlag: "", rol: "dev" },
    project: { permissions: { mode: "bypass" } },
  });
  assert.equal(withProject.permissions, "bypass", "project.permissions gana sobre la global prompt");
});

test("los 4 callers resuelven permissions por las formas con que llaman a render", () => {
  // orchestrator (sin project, sin sourceDir) → projectDir/.hermad/project.json
  const orchDir = writeProject(tmpDir("hermad-perm-orch-"), { mode: "bypass" });
  const orch = render.renderPersona({ projectDir: orchDir, name: "orquestador", persona: { kind: "claude", modelFlag: "", rol: "orq" } });
  assert.equal(orch.permissions, "bypass");
  assertBypassFlags("claude", vendors.startPlan("claude", "orquestador", {}, orch).args);

  // plan-devs: output en el worktree (sin project.json) → lee sourceDir (repo principal)
  const mainDir = writeProject(tmpDir("hermad-perm-main-"), { mode: "prompt" });
  const wtDir = tmpDir("hermad-perm-wt-");
  const dev = render.renderPersona({ projectDir: wtDir, sourceDir: mainDir, agentName: "dev-1", name: "dev", persona: { kind: "opencode", modelFlag: "", rol: "dev" } });
  assert.equal(dev.permissions, "prompt", "plan-devs lee el project.json del sourceDir");
  for (const flag of vendors.BYPASS_ARGS.opencode) assert.ok(!vendors.startPlan("opencode", "dev", {}, dev).args.includes(flag));

  // spawn: inyecta `project` hidratado → gana su permissions (legacy del test: bypass)
  writeGlobal({ mode: "prompt", acceptedAt: null });
  const spawnArt = render.renderPersona({ projectDir: tmpDir("hermad-perm-spawn-"), name: "dev", persona: { kind: "opencode", modelFlag: "", rol: "dev" }, project: { permissions: { mode: "bypass" } } });
  assert.equal(spawnArt.permissions, "bypass");
  assertBypassFlags("opencode", vendors.startPlan("opencode", "dev", {}, spawnArt).args);
});

test("codex/gemini son experimentales y nunca default", () => {
  assert.equal(vendors.isExperimental("codex"), true);
  assert.equal(vendors.isExperimental("gemini"), true);
  assert.equal(vendors.isExperimental("claude"), false);
  assert.equal(vendors.isExperimental("opencode"), false);
  assert.equal(vendors.pickDefaultVendor(["codex", "gemini"]), null, "solo experimentales → sin default");
  assert.equal(vendors.pickDefaultVendor(["gemini", "opencode"]), "opencode", "prefiere el estable");
  assert.equal(vendors.pickDefaultVendor(["hermes", "cli"]), "hermes");
});

test("config legacy (sin schemaVersion) avisa una vez que arranca en bypass", () => {
  fs.writeFileSync(config.CONFIG_PATH, JSON.stringify({ personas: { dev: { kind: "claude" } } }));
  const dir = tmpDir("hermad-perm-legacy-");
  const logs = [];
  const orig = console.log;
  console.log = (m) => logs.push(String(m));
  try {
    render.renderPersona({ projectDir: dir, name: "dev", persona: { kind: "claude", modelFlag: "", rol: "dev" } });
    render.renderPersona({ projectDir: dir, name: "dev", persona: { kind: "claude", modelFlag: "", rol: "dev" } });
  } finally {
    console.log = orig;
  }
  assert.equal(logs.filter((l) => l.includes("settings permissions")).length, 1, "aviso legacy una sola vez");
});
