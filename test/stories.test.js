"use strict";
const assert = require("assert");
const { test } = require("node:test");
const stories = require("../src/lib/stories");

const SAMPLE = `
# stories
- id: S1
  depends_on: []
  files: [src/a.ts, src/b.ts]
  ac: ["Given X, when Y, then Z", "AC 2"]
- id: S2
  depends_on: [S1]
  files: [src/a.ts]
  ac: []
- id: S3
  depends_on: []
  files: [src/c.ts]
  ac: ["ok"]
- id: S4
  depends_on: []
  files: []
  ac: ["cola secuencial"]
`;

test("parseStories respeta comas dentro de comillas y comentarios", () => {
  const s = stories.parseStories(SAMPLE);
  assert.deepEqual(s.map((x) => x.id), ["S1", "S2", "S3", "S4"]);
  assert.deepEqual(s[0].files, ["src/a.ts", "src/b.ts"]);
  assert.deepEqual(s[0].ac, ["Given X, when Y, then Z", "AC 2"]);
  assert.deepEqual(s[1].depends_on, ["S1"]);
});

test("selectParallel evita solape de files y manda sin-files a cola secuencial", () => {
  const { selected, deferred } = stories.selectParallel(stories.parseStories(SAMPLE), 3);
  const ids = selected.map((s) => s.id);
  assert.ok(ids.includes("S1"));
  assert.ok(ids.includes("S3"));
  assert.ok(!ids.includes("S2"), "S2 depende de S1 (pendiente)");
  assert.ok(!ids.includes("S4"), "S4 sin files → secuencial");
  assert.ok(deferred.find((d) => d.id === "S2" && /depende de S1/.test(d.reason)));
  assert.ok(deferred.find((d) => d.id === "S4" && /secuencial/.test(d.reason)));
});

test("selectParallel no lanza una story con depends_on pendiente, pero sí si ya está hecha", () => {
  const set = stories.parseStories(SAMPLE);
  const blocked = stories.selectParallel(set, 3, { done: [], active: [] });
  assert.ok(!blocked.selected.some((s) => s.id === "S2"), "S1 no está hecha → S2 diferida por dependencia");

  const unblocked = stories.selectParallel(set, 3, { done: ["S1"], active: [] });
  assert.ok(unblocked.selected.some((s) => s.id === "S2"), "S1 hecha → S2 ya puede entrar");
});

test("selectParallel no re-lanza stories hechas ni asignadas", () => {
  const { selected, deferred } = stories.selectParallel(stories.parseStories(SAMPLE), 3, { active: ["S1"], done: ["S3"] });
  const ids = selected.map((s) => s.id);
  assert.ok(!ids.includes("S1"), "S1 ya asignada");
  assert.ok(!ids.includes("S3"), "S3 ya hecha");
  assert.ok(deferred.find((d) => d.id === "S1" && /asignada/.test(d.reason)));
  assert.ok(deferred.find((d) => d.id === "S3" && /hecha/.test(d.reason)));
});

test("selectParallel difiere por solape de files", () => {
  const set = stories.parseStories(`
- id: X
  files: [src/a.ts]
- id: Y
  files: [src/a.ts, src/b.ts]
`);
  const { selected, deferred } = stories.selectParallel(set, 3);
  assert.deepEqual(selected.map((s) => s.id), ["X"]);
  assert.ok(deferred.find((d) => d.id === "Y" && /solape/.test(d.reason)));
});

test("selectParallel no toca files de stories en curso", () => {
  const set = stories.parseStories(`
- id: A
  files: [src/a.ts]
- id: B
  files: [src/a.ts, src/b.ts]
`);
  const { selected, deferred } = stories.selectParallel(set, 3, { active: ["A"] });
  assert.ok(!selected.some((s) => s.id === "A"), "A ya está en curso");
  const b = deferred.find((d) => d.id === "B");
  assert.ok(b && /solape/.test(b.reason), "B no debe pisar los files de A en curso");
});

test("selectParallel con 0 slots no selecciona nada (devs ocupados)", () => {
  const set = stories.parseStories(`
- id: A
  files: [x]
- id: B
  files: [y]
`);
  const { selected, deferred } = stories.selectParallel(set, 0);
  assert.equal(selected.length, 0);
  assert.equal(deferred.filter((d) => d.reason === "max_devs").length, 2);
});

test("selectParallel respeta max_devs", () => {
  const many = stories.parseStories(`
- id: A
  files: [x]
- id: B
  files: [y]
- id: C
  files: [z]
`);
  const { selected, deferred } = stories.selectParallel(many, 2);
  assert.equal(selected.length, 2);
  assert.ok(deferred.find((d) => d.reason === "max_devs"));
});
