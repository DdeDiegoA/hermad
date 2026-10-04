"use strict";
const assert = require("assert");
const { test } = require("node:test");
const { basePersona, departmentFor } = require("../src/lib/placement");

const P = (over = {}) => ({
  name: "hermad",
  personas: { dev: {}, reviewer: {}, architect: {} },
  departamentos: [
    ["producto", ["architect", "pm"]],
    ["desarrollo", ["dev"]],
    ["qa", ["reviewer"]],
  ],
  ...over,
});

test("basePersona usa primero el mapa lógico→vivo (state.agents)", () => {
  const state = { agents: { "dev-3": { persona: "reviewer" } } };
  assert.equal(basePersona("dev-3", { project: P(), state }), "reviewer");
});

test("basePersona quita el prefijo del slug del proyecto (nombre colisionado)", () => {
  assert.equal(basePersona("hermad-architect", { project: P() }), "architect");
});

test("basePersona matchea el prefijo más largo contra project.personas", () => {
  assert.equal(basePersona("dev-3", { project: P() }), "dev");
  assert.equal(basePersona("reviewer-opencode", { project: P() }), "reviewer");
  const long = P({ personas: { dev: {}, "dev-3": {} } });
  assert.equal(basePersona("dev-3", { project: long }), "dev-3", "el prefijo más largo gana");
  assert.equal(basePersona("dev-3-opencode", { project: long }), "dev-3");
});

test("basePersona no corta en el primer guion: sin mapa devuelve el nombre tal cual", () => {
  assert.equal(basePersona("code-reviewer", { project: { personas: {} } }), "code-reviewer");
  assert.equal(basePersona("desconocido", { project: P() }), "desconocido");
  assert.equal(basePersona("", { project: P() }), "");
});

test("departmentFor usa el mapa lógico→vivo para ubicar un dev colisionado", () => {
  const state = { agents: { "dev-3": { persona: "dev" } } };
  assert.equal(departmentFor(P(), "dev-3", { state }), "desarrollo");
});

test("departmentFor resuelve proyecto-persona y reviewer-opencode por prefijo", () => {
  assert.equal(departmentFor(P(), "hermad-dev-3"), "desarrollo");
  assert.equal(departmentFor(P(), "reviewer-opencode"), "qa");
});
