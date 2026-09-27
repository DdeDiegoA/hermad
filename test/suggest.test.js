"use strict";
const assert = require("assert");
const { test } = require("node:test");
const { parseSuggestions, buildSuggestPrompt } = require("../src/commands/skills");

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
