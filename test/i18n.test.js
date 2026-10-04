"use strict";
const assert = require("assert");
const { test } = require("node:test");
const { DICTS, t, translator, interpolate } = require("../src/lib/i18n");

test("es y en tienen exactamente las mismas claves (paridad, NFR-3)", () => {
  assert.deepEqual(Object.keys(DICTS.es).sort(), Object.keys(DICTS.en).sort());
});

test("cada clave tiene texto no vacío en los dos idiomas", () => {
  for (const [lang, d] of Object.entries(DICTS)) {
    for (const [key, value] of Object.entries(d)) {
      assert.equal(typeof value, "string", `${lang}.${key} no es string`);
      assert.ok(value.trim().length > 0, `${lang}.${key} vacío`);
    }
  }
});

test("el copy de los 9 pasos del doc ux está presente", () => {
  const steps = {
    "1 language": "language.note",
    "2 prereqs": "prereqs.node.ok",
    "3 vendors": "vendors.split.ask",
    "3 model": "model.note",
    "4 skills": "skills.consent.ask",
    "5 permissions": "perm.confirm.ask",
    "6 bmad": "bmad.body",
    "7 summary": "summary.ask",
    "8 apply": "apply.config.done",
    "9 completion": "completion.yes",
    "9 done": "done.outro",
  };
  for (const [step, key] of Object.entries(steps)) {
    assert.ok(DICTS.es[key] && DICTS.en[key], `falta ${key} (${step})`);
  }
});

test("no filtra strings del entorno del autor (A2)", () => {
  const forbidden = /\/Users\/|Diego|opencode-go|deepseek|kimi/;
  for (const [lang, d] of Object.entries(DICTS)) {
    for (const [key, value] of Object.entries(d)) {
      assert.ok(!forbidden.test(value), `${lang}.${key} filtra un string de entorno: ${value}`);
    }
  }
});

test("interpola variables y cae a en/key si falta la traducción", () => {
  assert.equal(t("es", "prereqs.node.ok", { v: "v20.12.0" }), "Node v20.12.0 (necesitas ≥ 20.12)");
  assert.equal(t("en", "completion.create", { path: "~/.zfunc/_hermad" }), "create ~/.zfunc/_hermad");
  assert.equal(t("xx", "done.outro"), DICTS.en["done.outro"], "idioma desconocido cae a en");
  assert.equal(t("es", "no.existe"), "no.existe", "clave ausente → la clave, no undefined");
  assert.equal(interpolate("a {b} {c}", { b: "1" }), "a 1 {c}", "variable faltante queda literal");
  assert.equal(translator("es")("skills.go"), "Buscar y proponer");
});
