"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");
const { test } = require("node:test");
const setup = require("../src/commands/setup");
const permissions = require("../src/wizard/steps/permissions");
const config = require("../src/lib/config");
const { translator, DICTS } = require("../src/lib/i18n");
const { headless } = require("../src/wizard/ui");

function tmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function fakeIO(stdinTTY = false) {
  const out = [];
  const err = [];
  return {
    io: { stdin: { isTTY: stdinTTY }, stdout: { write: (s) => out.push(s) }, stderr: { write: (s) => err.push(s) } },
    out,
    err,
  };
}

// UI interactiva simulada: colas de respuestas; vacío → default de la pregunta.
function scriptedUI({ selects = [], confirms = [], notes = [] } = {}) {
  return {
    mode: "clack",
    intro: async () => {},
    outro: async () => {},
    note: async (m) => {
      notes.push(String(m));
    },
    select: async (q) => (selects.length ? selects.shift() : q.defaultValue),
    confirm: async (q) => (confirms.length ? confirms.shift() : q.defaultValue),
    multiselect: async (q) => q.defaultValue || [],
    text: async (q) => q.defaultValue || "",
    spinner: () => ({ start() {}, message() {}, stop() {} }),
    cancelled: (v) => v === "CANCEL",
  };
}

function fixtureRepo() {
  const repo = tmp("setup-repo-");
  fs.mkdirSync(path.join(repo, "skill"), { recursive: true });
  fs.writeFileSync(path.join(repo, "skill", "SKILL.md"), "# x\n");
  fs.mkdirSync(path.join(repo, "command"), { recursive: true });
  fs.writeFileSync(path.join(repo, "command", "hermad.md"), "h\n");
  fs.writeFileSync(path.join(repo, "command", "orchestrate.md"), "o\n");
  fs.writeFileSync(path.join(repo, "package.json"), JSON.stringify({ version: "0.2.0" }));
  return repo;
}

function cleanEnv(home, repoRoot, ui) {
  return {
    home,
    repoRoot,
    configFile: path.join(home, ".hermad", "config.json"),
    locale: "en",
    ui,
    io: { stdin: { isTTY: true }, stdout: { write: () => {} }, stderr: { write: () => {} } },
    detect: () => ({ platform: "linux", node: { ok: true, version: "v22.0.0" }, herdr: { present: true, version: "1", install: "x" }, vendors: [{ kind: "claude", experimental: false }] }),
    listInstalled: () => [],
    hasBmad: () => false,
    exec: () => "ok",
    callVendor: () => {
      throw new Error("no-llm");
    },
  };
}

test("la pantalla de riesgo §6.2 se imprime completa en es y en (última frase incluida, ux §6.2)", () => {
  for (const lang of ["es", "en"]) {
    const text = permissions.riskText(translator(lang));
    for (const key of permissions.RISK_KEYS) assert.ok(text.includes(DICTS[lang][key]), `${lang}: falta ${key}`);
    assert.ok(text.includes(DICTS[lang]["perm.change"]), `${lang}: falta la última frase "cómo cambiarlo"`);
    assert.ok(text.includes(DICTS[lang]["perm.bypass.body"]));
  }
});

test("permisos: 'Sí, lo acepto' guarda bypass con acceptedAt ISO (FR-5.1, D1)", async () => {
  const notes = [];
  const ui = scriptedUI({ selects: ["bypass"], confirms: [true], notes });
  const ctx = { flags: {}, t: translator("es"), lang: "es" };
  await permissions.collect(ctx, ui);
  assert.equal(ctx.permissions.mode, "bypass");
  assert.match(ctx.permissions.acceptedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.ok(notes.join("\n").includes(DICTS.es["perm.change"]));
});

test("permisos: rechazar el riesgo deja el modo en prompt (FR-5.2)", async () => {
  const ui = scriptedUI({ selects: ["bypass"], confirms: [false] });
  const ctx = { flags: {}, t: translator("en"), lang: "en" };
  await permissions.collect(ctx, ui);
  assert.deepEqual(ctx.permissions, { mode: "prompt", acceptedAt: null });
});

test("permisos: headless (--yes) nunca implica bypass (D6)", async () => {
  const ui = headless(fakeIO().io);
  const ctx = { flags: {}, t: translator("en"), lang: "en" };
  await permissions.collect(ctx, ui);
  assert.equal(ctx.permissions.mode, "prompt");
  assert.equal(ctx.permissions.acceptedAt, null);
});

test("permisos: --accept-bypass imprime el riesgo e impone bypass sin preguntar (FR-5.1)", async () => {
  const notes = [];
  const ui = scriptedUI({ notes, selects: ["bypass"], confirms: [false] });
  const ctx = { flags: { acceptBypass: true }, t: translator("es"), lang: "es" };
  await permissions.collect(ctx, ui);
  assert.equal(ctx.permissions.mode, "bypass");
  assert.ok(notes.join("\n").includes(DICTS.es["perm.change"]));
});

test("cancelar antes del apply no escribe nada y sale 130 (FR-3.6, ux §12.7)", async () => {
  const home = tmp("setup-home-");
  const repoRoot = fixtureRepo();
  const ui = scriptedUI({ selects: ["CANCEL"] });
  const code = await setup.execute(["--lang", "en"], cleanEnv(home, repoRoot, ui));
  assert.equal(code, 130);
  assert.ok(!fs.existsSync(path.join(home, ".hermad", "config.json")));
  assert.ok(!fs.existsSync(path.join(home, ".hermad", "pack")));
});

test("elegir 'No, salir' en el resumen sale 0 sin escribir (FR-3.6)", async () => {
  const home = tmp("setup-home-");
  const repoRoot = fixtureRepo();
  const ui = scriptedUI({ selects: ["prompt"], confirms: [false, false] });
  const code = await setup.execute(["--lang", "en"], cleanEnv(home, repoRoot, ui));
  assert.equal(code, 0);
  assert.ok(!fs.existsSync(path.join(home, ".hermad", "config.json")));
  assert.ok(!fs.existsSync(path.join(home, ".hermad", "pack")));
});

test("legacy → bypass queda con marca explícita, no acceptedAt nulo (D4, item 3)", () => {
  const file = path.join(tmp("setup-home-"), "config.json");
  fs.writeFileSync(file, JSON.stringify({ personas: { dev: { kind: "claude" } } }));
  const c = config.load(file);
  assert.equal(c.permissions.mode, "bypass");
  assert.equal(c.permissions.legacy, true, "marca legacy explícita");
});
