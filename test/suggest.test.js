"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");
const { spawnSync } = require("child_process");
const { test } = require("node:test");
const { parseSuggestions, buildSuggestPrompt, applyGlobal, applyProject, validateNames, confirmGlobal, proposable } = require("../src/commands/skills");

const BIN = path.join(__dirname, "..", "bin", "hermad.js");

test("parseSuggestions extrae el JSON aunque venga con texto alrededor", () => {
  const out = "Claro:\n{\"skills\": [\"tdd-workflow\", \"security-review\"], \"reason\": \"encaja\"}\nfin";
  assert.deepEqual(parseSuggestions(out), ["tdd-workflow", "security-review"]);
  assert.equal(parseSuggestions("sin json"), null);
});

test("buildSuggestPrompt solo ofrece skills instaladas y manda el rol, no el cuerpo", () => {
  const p = buildSuggestPrompt({ personaName: "dev", role: "Amelia — build", current: ["a"], installed: [{ display: "b", description: "zz" }] });
  assert.match(p, /- b: zz/);
  assert.match(p, /no inventes/);
  assert.match(p, /Rol \(una línea\):\nAmelia — build/);
});

test("applyGlobal agrega sin duplicar y remueve", () => {
  assert.deepEqual(applyGlobal({ globalSkills: ["a"] }, "add", ["a", "b"]).globalSkills, ["a", "b"]);
  assert.deepEqual(applyGlobal({ globalSkills: ["a", "b"] }, "rm", ["a"]).globalSkills, ["b"]);
  assert.deepEqual(applyGlobal({}, "add", ["x"]).globalSkills, ["x"]);
});

test("applyProject escribe el override add/remove del proyecto", () => {
  const p = applyProject({ name: "x" }, "add", ["a"]);
  assert.deepEqual(p.skills, { add: ["a"], remove: [] });
  const q = applyProject(p, "rm", ["b"]);
  assert.deepEqual(q.skills, { add: ["a"], remove: ["b"] });
});

test("validateNames rechaza inexistentes salvo --force", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hermad-skills-"));
  const skillDir = path.join(dir, ".claude", "skills", "real");
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, "SKILL.md"), "---\nname: real\ndescription: d\n---\n");
  assert.deepEqual(validateNames(["real"], dir, false), { ok: true, missing: [] });
  assert.deepEqual(validateNames(["real", "nope"], dir, false), { ok: false, missing: ["nope"] });
  assert.deepEqual(validateNames(["nope"], dir, true), { ok: true, missing: [] });
});

test("proposable excluye el pack base y las globales ya efectivas", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "hermad-fu-"));
  const packDir = path.join(home, ".hermad", "pack");
  fs.mkdirSync(path.join(packDir, "skill"), { recursive: true });
  const list = [
    { id: "herdr-bmad", name: "herdr-bmad", dir: path.join(packDir, "skill") },
    { id: "caveman", name: "caveman", dir: path.join(home, ".claude", "skills", "caveman") },
    { id: "graphify", name: "graphify", dir: path.join(home, ".claude", "skills", "graphify") },
  ];
  assert.deepEqual(proposable(list, ["caveman"], home).map((s) => s.id), ["graphify"]);
});

// AC#12: con el vendor caído, `skills suggest` cae al matcher local y sale 0
// (el process.exit queda en el borde del CLI, no en el fallback).
test("AC#12: skills suggest con vendor caído cae al matcher local y sale 0 (FR-2.3)", { skip: process.platform === "win32" ? "fake vendor shim es POSIX-only" : false }, () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "hermad-fu-home-"));
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), "hermad-fu-proj-"));
  fs.mkdirSync(path.join(proj, ".hermad"), { recursive: true });
  fs.writeFileSync(
    path.join(proj, ".hermad", "project.json"),
    JSON.stringify({ name: "t", label: "t", projectDir: proj, personas: { dev: { kind: "claude" } }, departamentos: [] })
  );
  const skillDir = path.join(proj, ".claude", "skills", "code-review");
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, "SKILL.md"), "---\nname: code-review\ndescription: Reviews diffs for bugs\n---\n");

  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), "hermad-fu-bin-"));
  const fakeClaude = path.join(binDir, "claude");
  fs.writeFileSync(fakeClaude, "#!/bin/sh\necho 'not authenticated' >&2\nexit 1\n");
  fs.chmodSync(fakeClaude, 0o755);

  const env = { ...process.env, HOME: home, USERPROFILE: home, PATH: `${binDir}:${path.dirname(process.execPath)}:/usr/bin:/bin` };
  const res = spawnSync(process.execPath, [BIN, "skills", "suggest", "dev"], { cwd: proj, env, encoding: "utf8" });
  const all = `${res.stdout}${res.stderr}`;
  assert.equal(res.status, 0, `salió ${res.status}: ${all}`);
  assert.match(all, /buscador local/);
  assert.match(res.stdout, /Propuesta para 'dev'/);
});

test("confirmGlobal escribe recién al confirmar", async () => {
  const saved = [];
  const load = () => ({ globalSkills: ["base"] });
  const save = (cfg) => saved.push(cfg);
  assert.equal(await confirmGlobal(["a"], { ask: async () => "n", save, load }), false);
  assert.equal(saved.length, 0);
  assert.equal(await confirmGlobal(["a", "base"], { ask: async () => "y", save, load }), true);
  assert.deepEqual(saved[0].globalSkills, ["base", "a"]);
});

