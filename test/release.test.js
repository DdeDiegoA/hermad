"use strict";
// Guarda de release: la tabla de comandos del README no puede divergir de
// src/lib/commands-table.js, y la version publicada tiene que estar en el
// CHANGELOG. Si movés un comando/flag, tocá los dos lados.
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const { execFileSync } = require("child_process");
const { test } = require("node:test");

const ROOT = path.join(__dirname, "..");
const { COMMANDS } = require("../src/lib/commands-table");

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), "utf8");
}

// Seccion `## Comandos` del README → filas `| \`hermad <name>\` | <flags/sub> | ... |`.
function readmeCommandRows() {
  const readme = read("README.md");
  const section = readme.match(/^## Comandos\n([\s\S]*?)(?=\n## )/m);
  assert.ok(section, "README sin seccion '## Comandos'");
  const rows = [];
  for (const line of section[1].split("\n")) {
    const m = line.match(/^\|\s*`hermad ([^`]+)`\s*\|([^|]*)\|/);
    if (m) rows.push({ cell: m[1].trim(), detail: m[2] });
  }
  return rows;
}

test("README: la tabla de comandos cubre exactamente los comandos de la tabla (FR-6.3)", () => {
  const rows = readmeCommandRows();
  const listed = new Set(
    rows.map((r) => r.cell).filter((name) => !name.startsWith("-"))
  );
  const real = new Set(COMMANDS.map((c) => c.name));
  for (const name of real) {
    assert.ok(listed.has(name), `README sin el comando '${name}'`);
  }
  for (const name of listed) {
    assert.ok(real.has(name), `README lista '${name}', que no está en commands-table`);
  }
});

test("README: cada comando lista sus flags y subcomandos de la tabla", () => {
  const rows = readmeCommandRows();
  const byName = new Map(rows.map((r) => [r.cell, r.detail]));
  for (const c of COMMANDS) {
    const detail = byName.get(c.name);
    assert.ok(detail !== undefined, `README sin fila para '${c.name}'`);
    for (const flag of c.flags) {
      assert.ok(detail.includes(flag), `README no lista ${flag} en '${c.name}'`);
    }
    for (const sub of c.sub) {
      assert.ok(detail.includes(sub), `README no lista el sub '${sub}' en '${c.name}'`);
    }
  }
});

test("release: `hermad --version` imprime la version de package.json", () => {
  const pkg = JSON.parse(read("package.json"));
  const out = execFileSync(process.execPath, [path.join(ROOT, "bin", "hermad.js"), "--version"], {
    encoding: "utf8",
  }).trim();
  assert.equal(out, pkg.version);
});

test("release: el CHANGELOG tiene una entrada para la version actual", () => {
  const pkg = JSON.parse(read("package.json"));
  const changelog = read("CHANGELOG.md");
  const version = pkg.version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  assert.match(changelog, new RegExp(`^## \\[${version}\\] `, "m"), `CHANGELOG sin entrada para ${pkg.version}`);
});
