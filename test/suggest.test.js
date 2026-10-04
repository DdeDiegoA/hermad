"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");
const { test } = require("node:test");
const { parseSuggestions, buildSuggestPrompt, applyGlobal, applyProject, validateNames, confirmGlobal } = require("../src/commands/skills");

test("parseSuggestions extrae el JSON aunque venga con texto alrededor", () => {
  const out = "Claro:\n{\"skills\": [\"tdd-workflow\", \"security-review\"], \"reason\": \"encaja\"}\nfin";
  assert.deepEqual(parseSuggestions(out), ["tdd-workflow", "security-review"]);
  assert.equal(parseSuggestions("sin json"), null);
});

test("buildSuggestPrompt solo ofrece skills instaladas", () => {
  const p = buildSuggestPrompt({ personaName: "dev", body: "builder", current: ["a"], installed: [{ display: "b", description: "zz" }] });
  assert.match(p, /- b: zz/);
  assert.match(p, /no inventes/);
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

test("confirmGlobal escribe recién al confirmar", async () => {
  const saved = [];
  const load = () => ({ globalSkills: ["base"] });
  const save = (cfg) => saved.push(cfg);
  assert.equal(await confirmGlobal(["a"], { ask: async () => "n", save, load }), false);
  assert.equal(saved.length, 0);
  assert.equal(await confirmGlobal(["a", "base"], { ask: async () => "y", save, load }), true);
  assert.deepEqual(saved[0].globalSkills, ["base", "a"]);
});

