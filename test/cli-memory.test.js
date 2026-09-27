"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");
const { execFileSync } = require("child_process");
const { test } = require("node:test");

const BIN = path.join(__dirname, "..", "bin", "hermad.js");

function makeProject() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "hermad-home-"));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hermad-proj-"));
  fs.mkdirSync(path.join(dir, ".hermad"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, ".hermad", "project.json"),
    JSON.stringify({ name: "t", label: "t", projectDir: dir, personas: { dev: { kind: "claude" } }, departamentos: [] })
  );
  // En Windows os.homedir() usa USERPROFILE, no HOME → aislar los dos.
  const env = { ...process.env, HOME: home, USERPROFILE: home };
  return { dir, env };
}

test("hermad note parsea texto + flags (no se come el texto) y escribe el journal", () => {
  const { dir, env } = makeProject();
  execFileSync(process.execPath, [BIN, "note", "hola mundo", "--story", "S1"], { cwd: dir, env });
  const journal = fs.readFileSync(path.join(dir, ".hermad", "memory", "journal.md"), "utf8");
  assert.match(journal, /hola mundo/);
  assert.match(journal, /\[story:S1\]/);
});

test("hermad note sin flags escribe scope all", () => {
  const { dir, env } = makeProject();
  execFileSync(process.execPath, [BIN, "note", "solo texto"], { cwd: dir, env });
  const journal = fs.readFileSync(path.join(dir, ".hermad", "memory", "journal.md"), "utf8");
  assert.match(journal, /\[all\] solo texto/);
});

test("hermad send encola en el buzón del peer", () => {
  const { dir, env } = makeProject();
  execFileSync(process.execPath, [BIN, "send", "reviewer", "revisá S1", "--from", "dev"], { cwd: dir, env });
  const files = fs.readdirSync(path.join(dir, ".hermad", "inbox", "reviewer"));
  assert.equal(files.filter((f) => f.endsWith(".md")).length, 1);
  assert.match(fs.readFileSync(path.join(dir, ".hermad", "inbox", "reviewer", files[0]), "utf8"), /revisá S1/);
});

test("hermad memory slice imprime AGENTS.md + entradas de la persona", () => {
  const { dir, env } = makeProject();
  fs.writeFileSync(path.join(dir, "AGENTS.md"), "# Memoria\ncontexto");
  execFileSync(process.execPath, [BIN, "send", "reviewer", "nota para reviewer", "--from", "dev"], { cwd: dir, env });
  const out = execFileSync(process.execPath, [BIN, "memory", "slice", "reviewer"], { cwd: dir, env, encoding: "utf8" });
  assert.match(out, /# Memoria/);
  assert.match(out, /nota para reviewer/);
});
