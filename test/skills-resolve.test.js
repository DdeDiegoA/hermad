"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");
const { test } = require("node:test");

// HOME aislado ANTES de requerir skills (globalRoots cachea ~ al cargar).
process.env.HOME = process.env.USERPROFILE = fs.mkdtempSync(path.join(os.tmpdir(), "hermad-resolve-home-"));
const skills = require("../src/lib/skills");

// Plugin del cache de claude: cache/<marketplace>/<carpeta>/<version>/...
function makePlugin({ marketplace, dir, manifest, skill }) {
  const base = path.join(process.env.HOME, ".claude", "plugins", "cache", marketplace, dir, "1.0.0");
  fs.mkdirSync(path.join(base, ".claude-plugin"), { recursive: true });
  fs.writeFileSync(path.join(base, ".claude-plugin", "plugin.json"), JSON.stringify({ name: manifest, version: "1.0.0" }));
  const sd = path.join(base, "skills", skill);
  fs.mkdirSync(sd, { recursive: true });
  fs.writeFileSync(path.join(sd, "SKILL.md"), `---\nname: ${skill}\ndescription: x\n---\nbody\n`);
}

test("un globalSkill plugin con guiones en el namespace resuelve (regresión)", () => {
  // Carpeta y manifest con guiones; el id del índice y globalSkills usan el manifest.
  makePlugin({ marketplace: "karpathy-skills", dir: "andrej-karpathy-skills", manifest: "andrej-karpathy-skills", skill: "karpathy-guidelines" });
  const id = "andrej-karpathy-skills:karpathy-guidelines";
  const dir = skills.resolve(id);
  assert.ok(dir && dir.endsWith(path.join("skills", "karpathy-guidelines")), `resolve(${id}) = ${dir}`);
  assert.ok(skills.listInstalled().some((s) => s.id === id), "el índice conoce el id");
});

test("el namespace es el `name` del manifest, no la carpeta (dir != manifest)", () => {
  makePlugin({ marketplace: "mp", dir: "dash-dir", manifest: "dashed-plugin-name", skill: "some-skill" });
  const id = "dashed-plugin-name:some-skill";
  assert.ok(skills.resolve(id), "resuelve por el nombre del manifest");
  const ids = skills.listInstalled().map((s) => s.id);
  assert.ok(ids.includes(id), `ids: ${ids}`);
  assert.ok(!ids.includes("dash-dir:some-skill"), "no expone el nombre de carpeta como namespace");
});
