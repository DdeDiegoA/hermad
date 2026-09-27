"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");
const { test } = require("node:test");

// HOME aislado ANTES de requerir (active-project cachea ~/.hermad).
process.env.HOME = fs.mkdtempSync(path.join(os.tmpdir(), "hermad-setproj-home-"));
const { saveProjectPersonas } = require("../src/commands/settings-project");

test("saveProjectPersonas escribe el proyecto y NO la config global", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hermad-setproj-"));
  fs.mkdirSync(path.join(dir, ".hermad"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, ".hermad", "project.json"),
    JSON.stringify({ name: "p", label: "p", projectDir: dir, personas: { dev: { kind: "claude", modelFlag: "--model opus", rol: "dev" } }, departamentos: [["desarrollo", ["dev"]]] })
  );

  const personas = { dev: { kind: "opencode", modelFlag: "-m x/y", rol: "dev" } };
  saveProjectPersonas({ projectDir: dir, label: "p", name: "p", personas: {}, departamentos: [["desarrollo", ["dev"]]] }, personas);

  const onDisk = JSON.parse(fs.readFileSync(path.join(dir, ".hermad", "project.json"), "utf8"));
  assert.equal(onDisk.personas.dev.kind, "opencode");
  assert.equal(onDisk.label, "p");
  assert.match(fs.readFileSync(path.join(dir, ".hermad", "personas.env"), "utf8"), /dev\|opencode\|-m x\/y\|dev/);
  assert.equal(fs.existsSync(path.join(process.env.HOME, ".hermad", "config.json")), false, "no crea config global");

  // el activo queda completo (no el objeto reducido): incluye personas y departamentos.
  const active = JSON.parse(fs.readFileSync(path.join(process.env.HOME, ".hermad", "active-project.json"), "utf8"));
  assert.equal(active.projectDir, dir);
  assert.equal(active.personas.dev.kind, "opencode");
  assert.deepEqual(active.departamentos, [["desarrollo", ["dev"]]]);
  assert.equal(active.label, "p");
});
