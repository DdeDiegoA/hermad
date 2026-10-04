"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");
const { test } = require("node:test");

// HOME aislado ANTES de requerir (config y active-project cachean ~/.hermad).
// En Windows os.homedir() usa USERPROFILE, no HOME → espejamos el tmp en los dos.
process.env.HOME = process.env.USERPROFILE = fs.mkdtempSync(path.join(os.tmpdir(), "hermad-setagents-home-"));
const { applyGlobal, runPermissions } = require("../src/commands/settings-agents");
const config = require("../src/lib/config");
const { saveActiveProject } = require("../src/lib/active-project");

function readGlobal() {
  return JSON.parse(fs.readFileSync(path.join(process.env.HOME, ".hermad", "config.json"), "utf8"));
}

test("settings agents (plantilla global) NO modifica el project.json del activo", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hermad-setagents-"));
  fs.mkdirSync(path.join(dir, ".hermad"), { recursive: true });
  const projectJson = path.join(dir, ".hermad", "project.json");
  fs.writeFileSync(projectJson, JSON.stringify({ name: "p", label: "ORIG", projectDir: dir, personas: { dev: { kind: "claude", modelFlag: "--model opus", rol: "dev" } }, departamentos: [] }));
  saveActiveProject({ projectDir: dir, label: "ORIG", personas: { dev: { kind: "claude", modelFlag: "--model opus", rol: "dev" } }, departamentos: [] });
  const before = fs.readFileSync(projectJson, "utf8");

  applyGlobal({ personas: { dev: { kind: "opencode", modelFlag: "-m z", rol: "dev" } } });

  assert.equal(fs.readFileSync(projectJson, "utf8"), before, "project.json intacto");
  const cfg = JSON.parse(fs.readFileSync(path.join(process.env.HOME, ".hermad", "config.json"), "utf8"));
  assert.equal(cfg.personas.dev.kind, "opencode", "la plantilla global sí cambió");
});

test("settings agents preserva globalSkills y claves desconocidas (AC4 S6)", () => {
  const configPath = path.join(process.env.HOME, ".hermad", "config.json");
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify({ personas: { dev: { kind: "claude" } }, globalSkills: ["herdr-bmad"], customKey: 7 }));

  applyGlobal({ personas: { dev: { kind: "opencode", modelFlag: "", rol: "dev" } } });

  const cfg = JSON.parse(fs.readFileSync(configPath, "utf8"));
  assert.deepEqual(cfg.globalSkills, ["herdr-bmad"], "globalSkills sobrevive");
  assert.equal(cfg.customKey, 7, "clave desconocida sobrevive");
  assert.equal(cfg.personas.dev.kind, "opencode");
});

test("settings permissions prompt aplica sin preguntar", async () => {
  await runPermissions(["prompt"]);
  const cfg = readGlobal();
  assert.equal(cfg.permissions.mode, "prompt");
  assert.equal(cfg.permissions.acceptedAt, null);
});

test("settings permissions bypass exige aceptación: sin TTY solo --accept-bypass", async () => {
  await assert.rejects(() => runPermissions(["bypass"]), /accept-bypass/);
  assert.equal(readGlobal().permissions.mode, "prompt", "sin aceptación no cambia");
});

test("settings permissions bypass --accept-bypass guarda acceptedAt ISO", async () => {
  await runPermissions(["bypass", "--accept-bypass"]);
  const cfg = readGlobal();
  assert.equal(cfg.permissions.mode, "bypass");
  assert.ok(!Number.isNaN(Date.parse(cfg.permissions.acceptedAt)), "acceptedAt es ISO");
});

test("settings permissions --project escribe solo el project.json", async () => {
  await runPermissions(["prompt"]);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hermad-perm-proj-"));
  fs.mkdirSync(path.join(dir, ".hermad"), { recursive: true });
  const projectJson = path.join(dir, ".hermad", "project.json");
  fs.writeFileSync(projectJson, JSON.stringify({ name: "p", label: "p", projectDir: dir, personas: { dev: { kind: "claude", modelFlag: "", rol: "dev" } }, departamentos: [["desarrollo", ["dev"]]] }));

  await runPermissions(["bypass", "--accept-bypass", "--project", dir]);

  const onDisk = JSON.parse(fs.readFileSync(projectJson, "utf8"));
  assert.equal(onDisk.permissions.mode, "bypass", "el proyecto queda en bypass");
  assert.ok(!Number.isNaN(Date.parse(onDisk.permissions.acceptedAt)));
  assert.equal(readGlobal().permissions.mode, "prompt", "la config global no se toca");
});
