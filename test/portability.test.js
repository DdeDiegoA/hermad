"use strict";
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const { test } = require("node:test");

const ROOT = path.join(__dirname, "..");
const DIRS = ["src", "templates", "command", "skill"];
// NFR-1 / A2: ningún string del entorno del autor en lo distribuido.
const PATTERN = /\/Users\/|Diego|opencode-go|deepseek|kimi/;

function files(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) files(p, out);
    else out.push(p);
  }
  return out;
}

test("NFR-1/A2: sin strings del entorno del autor en src/templates/command/skill", () => {
  const hits = [];
  for (const top of DIRS) {
    for (const file of files(path.join(ROOT, top))) {
      const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
      lines.forEach((line, i) => {
        if (PATTERN.test(line)) hits.push(`${path.relative(ROOT, file)}:${i + 1}: ${line.trim()}`);
      });
    }
  }
  assert.deepEqual(hits, [], `coincidencias prohibidas:\n${hits.join("\n")}`);
});

test("las plantillas distribuidas usan {{user}}/the user, nunca un nombre fijo", () => {
  const agents = fs.readFileSync(path.join(ROOT, "templates", "AGENTS-template.md"), "utf8");
  assert.match(agents, /\{\{user\}\}/);
  for (const f of fs.readdirSync(path.join(ROOT, "templates", "prompts"))) {
    const md = fs.readFileSync(path.join(ROOT, "templates", "prompts", f), "utf8");
    assert.doesNotMatch(md, /Diego/, f);
  }
});

test("el personas.env de ejemplo ya no se distribuye (FR-1.6)", () => {
  assert.equal(fs.existsSync(path.join(ROOT, "skill", "scripts", "personas.env")), false);
});
