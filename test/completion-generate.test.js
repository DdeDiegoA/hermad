"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");
const { execFileSync } = require("child_process");
const { test } = require("node:test");

const { COMMANDS } = require("../src/lib/commands-table");
const BIN = path.join(__dirname, "..", "bin", "hermad.js");
const GENERATORS = {
  zsh: require("../src/lib/completion/zsh"),
  bash: require("../src/lib/completion/bash"),
  fish: require("../src/lib/completion/fish"),
  powershell: require("../src/lib/completion/powershell"),
};

test("cada generador incluye todos los comandos y flags de la tabla (FR-6.3)", () => {
  for (const [shell, gen] of Object.entries(GENERATORS)) {
    const out = gen.generate(COMMANDS);
    assert.equal(typeof out, "string", `${shell}: no devuelve string`);
    for (const c of COMMANDS) {
      assert.ok(out.includes(c.name), `${shell}: falta el comando ${c.name}`);
      for (const flag of c.flags) assert.ok(out.includes(flag), `${shell}: ${c.name} sin el flag ${flag}`);
    }
  }
});

test("bash es compatible con 3.2: sin compopt ni arrays asociativos (FR-6.5)", () => {
  const out = GENERATORS.bash.generate(COMMANDS);
  assert.doesNotMatch(out, /compopt/);
  assert.doesNotMatch(out, /(declare|local|typeset)\s+-A/);
});

test("los 4 generadores cubren el mismo set de comandos (A3)", () => {
  for (const [shell, gen] of Object.entries(GENERATORS)) {
    const out = gen.generate(COMMANDS);
    for (const c of COMMANDS) assert.ok(out.includes(c.name), `${shell}: sin el comando ${c.name}`);
  }
});

test("hermad completion <shell> imprime a stdout sin tocar disco (FR-6.1)", () => {
  for (const shell of Object.keys(GENERATORS)) {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "hermad-cmp-home-"));
    const out = execFileSync(process.execPath, [BIN, "completion", shell], {
      encoding: "utf8",
      env: { ...process.env, HOME: home, USERPROFILE: home },
    });
    assert.equal(out, GENERATORS[shell].generate(COMMANDS), `${shell}: stdout != generate()`);
    assert.deepEqual(fs.readdirSync(home), [], `${shell}: tocó disco en HOME`);
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test("un sub desconocido imprime el uso y sale 1", () => {
  let err;
  try {
    execFileSync(process.execPath, [BIN, "completion", "nope"], { encoding: "utf8" });
  } catch (e) {
    err = e;
  }
  assert.ok(err, "deberia salir != 0");
  assert.equal(err.status, 1);
  assert.match(String(err.stderr), /Uso:/);
});
