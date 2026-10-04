"use strict";
const os = require("os");
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const { execFileSync } = require("child_process");
const { test } = require("node:test");

// Aislar HOME ANTES de requerir los módulos que cachean ~/.hermad/*.
// En Windows os.homedir() usa USERPROFILE, no HOME → espejamos el tmp en los dos.
const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "hermad-home-"));
process.env.HOME = process.env.USERPROFILE = tmpHome;

const { resolveProject } = require("../src/lib/project");
const { saveActiveProject } = require("../src/lib/active-project");

test("sube desde el cwd y migra el project.json a autocontenido", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hermad-proj-"));
  fs.mkdirSync(path.join(root, ".hermad"), { recursive: true });
  // project.json viejo (sin personas/departamentos) — debe migrar.
  fs.writeFileSync(path.join(root, ".hermad", "project.json"), JSON.stringify({ name: "B", projectDir: "/viejo" }));
  const nested = path.join(root, "src", "deep");
  fs.mkdirSync(nested, { recursive: true });

  const p = resolveProject(nested);
  assert.equal(p.projectDir, root, "resuelve el dir que contiene .hermad");
  assert.ok(p.personas && p.personas.orquestador, "rellena personas desde config");
  assert.ok(Array.isArray(p.departamentos) && p.departamentos.length, "rellena departamentos");

  const onDisk = JSON.parse(fs.readFileSync(path.join(root, ".hermad", "project.json"), "utf8"));
  assert.ok(onDisk.personas && onDisk.departamentos, "reescribe autocontenido");
  assert.equal(onDisk.label, "B");
});

test("hydrate agrega personas nuevas del código (reader) sin pisar las del proyecto", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hermad-hyd-"));
  fs.mkdirSync(path.join(root, ".hermad"), { recursive: true });
  fs.writeFileSync(
    path.join(root, ".hermad", "project.json"),
    JSON.stringify({
      name: "H",
      label: "H",
      projectDir: root,
      personas: { dev: { kind: "hermes", modelFlag: "--x", rol: "custom" } },
      departamentos: [["desarrollo", ["dev"]]],
    })
  );
  const p = resolveProject(root);
  assert.ok(p.personas.reader, "reader (nueva en el código) se agrega");
  assert.equal(p.personas.dev.kind, "hermes", "dev personalizado se respeta");
  assert.equal(p.personas.dev.rol, "custom");
});

test("resuelve al repo principal desde un worktree (journal/inbox compartidos)", () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "hermad-repo-"));
  fs.mkdirSync(path.join(repo, ".hermad"), { recursive: true });
  fs.writeFileSync(path.join(repo, ".hermad", "project.json"), JSON.stringify({ name: "R", label: "R", personas: {}, departamentos: [] }));
  const git = (args) => execFileSync("git", args, { cwd: repo, stdio: "pipe" });
  git(["init", "-q"]);
  git(["config", "user.email", "t@t"]);
  git(["config", "user.name", "t"]);
  git(["add", "-A"]);
  git(["commit", "-qm", "init"]);
  const wt = path.join(repo, ".hermad", "worktrees", "S1");
  git(["worktree", "add", "-b", "hermad/S1", wt, "HEAD"]);

  const p = resolveProject(wt);
  // Canónico de verdad: /private/var vs /var (macOS) y nombres cortos 8.3 (Windows,
  // p.ej. RUNNER~1); fs.realpathSync (JS) no expande los 8.3, .native sí.
  const real = (x) => fs.realpathSync.native(x);
  assert.equal(real(p.projectDir), real(repo), "remapea el worktree al repo principal");

  git(["worktree", "remove", "--force", wt]);
});

test("cae al proyecto activo global cuando no hay project.json", () => {
  saveActiveProject({ projectDir: "/x", label: "x", personas: { orquestador: { kind: "claude", modelFlag: "", rol: "r" } }, departamentos: [] });
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), "hermad-empty-"));
  const p = resolveProject(empty);
  assert.equal(p.projectDir, "/x");
});

test("strict no cae al proyecto activo global", () => {
  saveActiveProject({ projectDir: "/x", label: "x", personas: { orquestador: { kind: "claude", modelFlag: "", rol: "r" } }, departamentos: [] });
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), "hermad-empty-strict-"));
  assert.equal(resolveProject(empty, { strict: true }), null);
});

test("devuelve null sin project.json ni activo", () => {
  const emptyHome = fs.mkdtempSync(path.join(os.tmpdir(), "hermad-home2-"));
  const savedHome = process.env.HOME;
  const savedProfile = process.env.USERPROFILE;
  process.env.HOME = process.env.USERPROFILE = emptyHome;
  // recargar active-project con el HOME limpio
  delete require.cache[require.resolve("../src/lib/active-project")];
  delete require.cache[require.resolve("../src/lib/project")];
  const fresh = require("../src/lib/project");
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), "hermad-empty2-"));
  assert.equal(fresh.resolveProject(empty), null);
  process.env.HOME = savedHome;
  process.env.USERPROFILE = savedProfile;
});

test("hydrate conserva claves opcionales (routes, autoClose)", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hermad-proj-"));
  fs.mkdirSync(path.join(dir, ".hermad"));
  const routes = [{ on: "DONE", from: "dev", to: "reviewer" }];
  fs.writeFileSync(path.join(dir, ".hermad", "project.json"), JSON.stringify({ name: "x", routes, autoClose: false }));
  const p = resolveProject(dir, { strict: true });
  assert.deepStrictEqual(p.routes, routes);
  assert.strictEqual(p.autoClose, false);
});

test("hydrate conserva permissions del proyecto (override sobre la global)", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hermad-proj-perm-"));
  fs.mkdirSync(path.join(dir, ".hermad"));
  const permissions = { mode: "prompt", acceptedAt: null };
  fs.writeFileSync(path.join(dir, ".hermad", "project.json"), JSON.stringify({ name: "x", permissions }));
  const p = resolveProject(dir, { strict: true });
  assert.deepStrictEqual(p.permissions, permissions, "el hydrate no descarta permissions");
  const onDisk = JSON.parse(fs.readFileSync(path.join(dir, ".hermad", "project.json"), "utf8"));
  assert.deepStrictEqual(onDisk.permissions, permissions, "sobrevive a la reescritura del hydrate");
});
