"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");
const { test } = require("node:test");

// HOME aislado ANTES de requerir (config/render cachean ~ al cargar).
// En Windows os.homedir() usa USERPROFILE, no HOME → espejamos el tmp en los dos.
process.env.HOME = process.env.USERPROFILE = fs.mkdtempSync(path.join(os.tmpdir(), "hermad-cfgv2-"));

const config = require("../src/lib/config");
const render = require("../src/lib/render");

test("config nueva: schemaVersion 2, claves completas y ningún vendor por defecto", () => {
  const c = config.load(path.join(process.env.HOME, "no-existe.json"));
  assert.equal(c.schemaVersion, 2);
  assert.equal(c.language, "en");
  assert.equal(c.userName, "");
  assert.deepEqual(c.permissions, { mode: "prompt", acceptedAt: null });
  assert.deepEqual(c.globalSkills, []);
  assert.deepEqual(c.personaSkills, {});
  assert.deepEqual(c.bmad, { autoInstall: false });
  for (const [name, p] of Object.entries(c.personas)) {
    assert.equal(p.kind, "", `${name} sin kind por defecto (FR-4.5)`);
    assert.equal(p.modelFlag, "", `${name} sin modelFlag por defecto`);
    assert.ok(p.rol, `${name} conserva su rol`);
  }
});

test("DEFAULT_PERSONAS trae solo rol", () => {
  for (const [name, p] of Object.entries(config.DEFAULT_PERSONAS)) {
    assert.deepEqual(Object.keys(p).sort(), ["kind", "modelFlag", "rol"], `${name} solo rol/kind/modelFlag`);
    assert.equal(p.kind, "");
    assert.equal(p.modelFlag, "");
  }
});

test("una persona sin vendor aborta mandando a hermad setup", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hermad-nokind-"));
  assert.throws(
    () => render.renderPersona({ projectDir: dir, name: "dev", persona: { kind: "", modelFlag: "", rol: "dev" } }),
    /hermad setup/
  );
});

test("legacy sin schemaVersion: respeta personas, preserva claves y migra al guardar", () => {
  const file = path.join(process.env.HOME, "legacy.json");
  fs.writeFileSync(
    file,
    JSON.stringify({
      personas: { dev: { kind: "claude", modelFlag: "--model opus", rol: "mío" } },
      globalSkills: ["herdr-bmad"],
      customKey: 7,
    })
  );
  const c = config.load(file);
  assert.equal(c.schemaVersion, 2, "en memoria ya es v2");
  assert.equal(c.personas.dev.kind, "claude", "respeta el vendor del usuario");
  assert.equal(c.personas.dev.rol, "mío", "respeta el rol");
  assert.equal(c.personas.reader.kind, "", "los defaults vacíos no pisan personas del usuario");
  assert.equal(c.customKey, 7, "clave desconocida preservada");
  assert.deepEqual(c.globalSkills, ["herdr-bmad"]);
  assert.equal(c.permissions.mode, "bypass", "legacy arranca en bypass (sin regresión, D4)");

  config.save({ personas: c.personas }, file);
  const round = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.equal(round.schemaVersion, 2, "el próximo save escribe schemaVersion 2");
  assert.equal(round.permissions.mode, "bypass");
  assert.equal(round.customKey, 7, "save angosto no borra claves desconocidas");
  assert.deepEqual(round.globalSkills, ["herdr-bmad"]);
});
