"use strict";
const assert = require("assert");
const { test } = require("node:test");
const discovery = require("../src/lib/discovery");

const LIST = [
  { id: "code-review", name: "code-review", description: "Reviews diffs for bugs and style" },
  { id: "design-system", name: "design-system", description: "Visual design tokens and components" },
];

test("local sin consentimiento: matcher BM25 y globales sin preseleccionar (FR-2.3, NFR-5)", () => {
  let called = false;
  const res = discovery.suggest({
    list: LIST,
    personas: ["dev"],
    personaBodies: { dev: "code review of diffs" },
    callVendor: () => {
      called = true;
    },
  });
  assert.equal(res.source, "local");
  assert.equal(called, false, "no llama al vendor sin consentimiento");
  assert.deepEqual(res.byPersona.dev.map((s) => s.name), ["code-review"]);
  assert.ok(res.byPersona.dev.every((s) => s.selected));
  assert.ok(res.global.every((g) => !g.selected), "globales locales sin preselección");
  assert.deepEqual(res.warnings, []);
});

test("consentimiento + vendor: usa el LLM y preselecciona lo recomendado (FR-2.1, FR-2.4)", () => {
  const res = discovery.suggest({
    list: LIST,
    personas: ["dev"],
    personaBodies: { dev: "builder" },
    vendor: "claude",
    consent: true,
    callVendor: () => JSON.stringify({ global: ["code-review"], byPersona: { dev: ["code-review"] }, reason: "fits" }),
  });
  assert.equal(res.source, "llm");
  assert.deepEqual(res.global.filter((g) => g.selected).map((g) => g.name), ["code-review"]);
  assert.equal(res.byPersona.dev[0].name, "code-review");
  assert.equal(res.byPersona.dev[0].reason, "fits");
});

test("fallo del LLM cae al matcher local con warning, nunca corta (FR-2.3)", () => {
  const res = discovery.suggest({
    list: LIST,
    personas: ["dev"],
    personaBodies: { dev: "code review" },
    vendor: "claude",
    consent: true,
    callVendor: () => {
      throw new Error("no auth");
    },
  });
  assert.equal(res.source, "local");
  assert.equal(res.warnings.length, 1);
  assert.match(res.warnings[0], /no auth/);
});

test("no propone como candidatas las skills que ya son globales (local y LLM)", () => {
  const list = [
    { id: "caveman", name: "caveman", description: "Short terse replies" },
    { id: "graphify", name: "graphify", description: "Knowledge graph of code" },
  ];
  const local = discovery.suggest({ list, personas: ["dev"], personaBodies: { dev: "short replies graph" }, globals: ["caveman"] });
  assert.deepEqual(local.global.map((g) => g.name), ["graphify"], "caveman ya es global");
  assert.ok(!local.byPersona.dev.some((s) => s.name === "caveman"), "matcher local también la excluye");

  const llm = discovery.suggest({
    list,
    personas: ["dev"],
    personaBodies: { dev: "x" },
    globals: ["caveman"],
    vendor: "claude",
    consent: true,
    callVendor: () => JSON.stringify({ global: ["caveman", "graphify"], byPersona: { dev: ["caveman"] }, reason: "r" }),
  });
  assert.deepEqual(llm.global.map((g) => g.name), ["graphify"], "aunque el LLM la recomiende, no se propone");
});

test("cero skills instaladas: resultado vacío sin warnings ni llamadas (FR-2.5)", () => {
  let called = false;
  const res = discovery.suggest({
    list: [],
    personas: ["dev"],
    personaBodies: { dev: "x" },
    vendor: "claude",
    consent: true,
    callVendor: () => {
      called = true;
    },
  });
  assert.deepEqual(res, { source: "local", global: [], byPersona: {}, warnings: [] });
  assert.equal(called, false);
});
