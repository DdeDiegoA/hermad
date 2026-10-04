"use strict";
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const { test } = require("node:test");

const root = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

// La regla "el orquestador solo delega" es inviolable: si alguien la borra,
// este test rompe. Cubre el prompt de persona y las dos superficies de comando.
test("el prompt del orquestador hornea la regla inviolable de delegar", () => {
  const md = read("templates/prompts/orquestador.md");
  assert.match(md, /## Inviolable rule — you only delegate/);
  assert.match(md, /\*\*NEVER:\*\*/);
  assert.match(md, /\*\*INSTEAD delegate:\*\*/);
  assert.match(md, /\*\*ALLOWED \(the only exceptions\):\*\*/);
  assert.match(md, /Self-check before every action/);
});

test("los comandos /hermad y /hermad:orchestrate recuerdan la regla", () => {
  for (const rel of ["command/hermad.md", "command/orchestrate.md"]) {
    assert.match(read(rel), /Inviolable rule — you only delegate/, rel);
  }
});
