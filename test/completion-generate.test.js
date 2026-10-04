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

// El header comentado lista todos los comandos/flags, así que un includes() crudo
// pasaría aunque la lógica de completion no ofrezca nada. Se compara contra el
// CUERPO (sin comentarios): ahí viven los compadd/compgen/complete/case reales.
function stripComments(out) {
  return out.split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");
}

function assertCovers(shell, gen, commands) {
  const body = stripComments(gen.generate(commands));
  assert.equal(typeof body, "string", `${shell}: no devuelve string`);
  for (const c of commands) {
    assert.ok(body.includes(c.name), `${shell}: falta el comando ${c.name} en el cuerpo`);
    for (const flag of c.flags) assert.ok(body.includes(flag), `${shell}: ${c.name} sin el flag ${flag} en el cuerpo`);
  }
}

test("cada generador incluye todos los comandos y flags de la tabla en el cuerpo (FR-6.3)", () => {
  for (const [shell, gen] of Object.entries(GENERATORS)) assertCovers(shell, gen, COMMANDS);
});

test("la paridad no es vacua: si un comando desaparece del cuerpo, el check falla aunque siga en el header", () => {
  const victim = COMMANDS.find((c) => c.name === "daemon");
  const out = GENERATORS.zsh.generate(COMMANDS);
  assert.ok(stripComments(out).includes(victim.name), "el original sí lo ofrece");
  const broken = out
    .split("\n")
    .map((l) => (/^\s*#/.test(l) ? l : l.split(victim.name).join(""))) // borra del cuerpo, deja el header
    .join("\n");
  assert.throws(() => assertCovers("zsh", { generate: () => broken }, COMMANDS), /falta el comando daemon/);
});

test("bash es compatible con 3.2: sin compopt ni arrays asociativos (FR-6.5)", () => {
  const out = GENERATORS.bash.generate(COMMANDS);
  assert.doesNotMatch(out, /compopt/);
  assert.doesNotMatch(out, /(declare|local|typeset)\s+-A/);
});

test("los 4 generadores cubren el mismo set de comandos (A3)", () => {
  for (const [shell, gen] of Object.entries(GENERATORS)) assertCovers(shell, gen, COMMANDS);
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
