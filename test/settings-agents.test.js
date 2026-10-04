"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");
const { test } = require("node:test");

// HOME aislado ANTES de requerir (config y active-project cachean ~/.hermad).
// En Windows os.homedir() usa USERPROFILE, no HOME → espejamos el tmp en los dos.
process.env.HOME = process.env.USERPROFILE = fs.mkdtempSync(path.join(os.tmpdir(), "hermad-setagents-home-"));
const { applyGlobal } = require("../src/commands/settings-agents");
const { saveActiveProject } = require("../src/lib/active-project");

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
