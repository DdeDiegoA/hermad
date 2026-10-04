"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");
const { test } = require("node:test");
const skills = require("../src/lib/skills");
const skillsIndex = require("../src/lib/skills-index");
const config = require("../src/lib/config");

const T0 = Date.parse("2026-10-04T00:00:00Z");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hermad-ski-"));

function makeSkill(dir, name, description) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "SKILL.md"), `---\nname: ${name}\ndescription: ${description}\n---\nbody\n`);
}

// Corre un build con scanRoots stubbeado: registra cuántas veces se reindexan
// las roots globales (roots.length > 0) y devuelve `result`.
function withStubScan(result, fn) {
  const orig = skills.scanRoots;
  const calls = { globals: 0 };
  skills.scanRoots = (roots) => {
    if (roots.length) calls.globals++;
    return roots.length ? result : orig(roots);
  };
  try {
    return fn(calls);
  } finally {
    skills.scanRoots = orig;
  }
}

test("build indexa id/name/description/dir/source y escribe el cache", () => {
  const root = path.join(tmp, "claude-skills");
  makeSkill(path.join(root, "tdd"), "tdd", "test driven development");
  const cachePath = path.join(tmp, "c1", "skills-index.json");
  const rows = skillsIndex.build({
    globalRoots: [{ dir: root, plugin: null, source: "claude" }],
    projectRoots: [],
    cachePath,
    now: T0,
  });
  const tdd = rows.find((s) => s.id === "tdd");
  assert.ok(tdd);
  assert.equal(tdd.name, "tdd");
  assert.equal(tdd.description, "test driven development");
  assert.equal(tdd.dir, path.join(root, "tdd"));
  assert.equal(tdd.source, "claude");

  const cache = JSON.parse(fs.readFileSync(cachePath, "utf8"));
  assert.equal(cache.version, 1);
  assert.equal(cache.fingerprint, skillsIndex.fingerprint([{ dir: root, plugin: null }]));
  assert.equal(cache.builtAt, new Date(T0).toISOString());
  assert.equal(cache.skills[0].id, "tdd");
});

test("cache hit: no reindexa si el fingerprint y el TTL siguen vigentes", () => {
  const root = path.join(tmp, "hit");
  makeSkill(path.join(root, "a"), "a", "alpha");
  const cachePath = path.join(tmp, "c2", "skills-index.json");
  const roots = [{ dir: root, plugin: null, source: "claude" }];
  const orig = skills.scanRoots;
  let scanning = [{ id: "fantasma", name: "fantasma", description: "", dir: "/x", source: "claude" }];
  let calls = 0;
  skills.scanRoots = (r) => {
    if (r.length) calls++;
    return r.length ? scanning : orig(r);
  };
  try {
    skillsIndex.build({ globalRoots: roots, projectRoots: [], cachePath, now: T0 });
    assert.equal(calls, 1);
    scanning = [{ id: "nuevo", name: "nuevo", description: "", dir: "/y", source: "claude" }];
    // segundo build: mismo fingerprint, dentro del TTL → usa cache (no rescan)
    const rows = skillsIndex.build({ globalRoots: roots, projectRoots: [], cachePath, now: T0 + 1000 });
    assert.equal(calls, 1);
    assert.equal(rows[0].id, "fantasma");
    // refresh fuerza reindex (devuelve el stub actualizado)
    const refreshed = skillsIndex.build({ globalRoots: roots, projectRoots: [], cachePath, now: T0 + 1000, refresh: true });
    assert.equal(calls, 2);
    assert.equal(refreshed[0].id, "nuevo");
  } finally {
    skills.scanRoots = orig;
  }
});

test("reindexa si pasaron 24h o si cambia el fingerprint", () => {
  const root = path.join(tmp, "ttl");
  makeSkill(path.join(root, "a"), "a", "alpha");
  const cachePath = path.join(tmp, "c3", "skills-index.json");
  const roots = [{ dir: root, plugin: null, source: "claude" }];
  skillsIndex.build({ globalRoots: roots, projectRoots: [], cachePath, now: T0 });
  withStubScan([], (calls) => {
    // 25 h después → TTL vencido → reindexa
    skillsIndex.build({ globalRoots: roots, projectRoots: [], cachePath, now: T0 + 25 * 60 * 60 * 1000 });
    assert.equal(calls.globals, 1);
  });
  // cambia el fingerprint (nueva skill en el root) → reindexa
  makeSkill(path.join(root, "b"), "b", "beta");
  const rows = skillsIndex.build({ globalRoots: roots, projectRoots: [], cachePath, now: T0 });
  assert.ok(rows.find((s) => s.id === "b"));
});

test("las roots del proyecto se mergean en vivo y ganan ante mismo id", () => {
  const globalRoot = path.join(tmp, "g");
  const projRoot = path.join(tmp, "p");
  makeSkill(path.join(globalRoot, "dup"), "dup", "version global");
  makeSkill(path.join(projRoot, "dup"), "dup", "version proyecto");
  const rows = skillsIndex.build({
    globalRoots: [{ dir: globalRoot, plugin: null, source: "claude" }],
    projectRoots: [{ dir: projRoot, plugin: null, source: "project" }],
    cachePath: path.join(tmp, "c4", "skills-index.json"),
    now: T0,
  });
  assert.equal(rows.filter((s) => s.id === "dup").length, 1);
  assert.equal(rows.find((s) => s.id === "dup").source, "project");
});

test("match rankea por name x3 / description x1", () => {
  const docs = [
    { id: "a", name: "tdd", description: "test driven development cycle", dir: "/a", source: "claude" },
    { id: "b", name: "caveman", description: "terse prose style", dir: "/b", source: "claude" },
    { id: "c", name: "deploy", description: "ship to production", dir: "/c", source: "claude" },
  ];
  const rows = skillsIndex.match("test driven development", { list: docs });
  assert.equal(rows[0].id, "a");
  assert.ok(!rows.some((s) => s.id === "c"));
});

test("match hace stemming: 'debug' matchea 'systematic-debugging' (regresión)", () => {
  const docs = [
    { id: "systematic-debugging", name: "systematic-debugging", description: "root-cause method", dir: "/a", source: "hermes" },
    { id: "deploy", name: "deploy", description: "ship to production", dir: "/b", source: "claude" },
  ];
  const rows = skillsIndex.match("debug", { list: docs });
  assert.equal(rows[0].id, "systematic-debugging", `debug debe matchear debugging: ${JSON.stringify(rows)}`);
  assert.ok(!rows.some((s) => s.id === "deploy"), "no matchea términos sin relación");
  // el sufijo tampoco rompe el match exacto
  assert.equal(skillsIndex.match("debugging", { list: docs })[0].id, "systematic-debugging");
});

test("match excluye las globales efectivas y aplica el boost de la persona", () => {
  const docs = [
    { id: "a", name: "common", description: "x", dir: "/a", source: "claude" },
    { id: "b", name: "common", description: "x", dir: "/b", source: "claude" },
  ];
  assert.equal(skillsIndex.match("common", { list: docs })[0].id, "a");
  assert.equal(skillsIndex.match("common", { list: docs, personaSkills: ["b"] })[0].id, "b");
  assert.ok(skillsIndex.match("common", { list: docs, globals: ["a"] }).every((s) => s.id !== "a"));
});

test("effectiveGlobals = global ∪ add − remove", () => {
  const project = { skills: { add: ["b"], remove: ["a"] } };
  assert.deepEqual(skills.effectiveGlobals(project, { config: { globalSkills: ["a", "c"] } }), ["c", "b"]);
  assert.deepEqual(skills.effectiveGlobals({}, { config: { globalSkills: ["x"] } }), ["x"]);
});

test("config preserva claves desconocidas y globalSkills al guardar", () => {
  const file = path.join(tmp, "config.json");
  fs.writeFileSync(
    file,
    JSON.stringify({ personas: { dev: { kind: "opencode" } }, globalSkills: ["herdr-bmad"], customKey: 42 }, null, 2)
  );
  const cfg = config.load(file);
  assert.equal(cfg.customKey, 42);
  assert.deepEqual(cfg.globalSkills, ["herdr-bmad"]);
  assert.equal(cfg.personas.dev.kind, "opencode");
  config.save(cfg, file);
  const round = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.equal(round.customKey, 42);
  assert.deepEqual(round.globalSkills, ["herdr-bmad"]);
});

test("config.save con un objeto angosto NO borra globalSkills (regresión)", () => {
  const file = path.join(tmp, "config-narrow.json");
  fs.writeFileSync(file, JSON.stringify({ personas: { dev: { kind: "opencode" } }, globalSkills: ["herdr-bmad"] }));
  // caller tipo settings-agents: guarda solo personas
  config.save({ personas: { dev: { kind: "claude" } } }, file);
  const round = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.deepEqual(round.globalSkills, ["herdr-bmad"]);
  assert.equal(round.personas.dev.kind, "claude");
});

test("skillMeta saca las comillas YAML de la description", () => {
  const root = path.join(tmp, "quotes");
  makeSkill(path.join(root, "q"), "q", '"TDD: enforce RED-GREEN-REFACTOR"');
  const rows = skillsIndex.build({
    globalRoots: [{ dir: root, plugin: null, source: "claude" }],
    projectRoots: [],
    cachePath: path.join(tmp, "c5", "skills-index.json"),
    now: T0,
  });
  assert.equal(rows[0].description, "TDD: enforce RED-GREEN-REFACTOR");
});
