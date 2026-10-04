"use strict";
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const { execFileSync } = require("child_process");
const { test } = require("node:test");

const { COMMANDS, resolve, helpText } = require("../src/lib/commands-table");

const COMMANDS_DIR = path.join(__dirname, "..", "src", "commands");
const CLI_SRC = path.join(__dirname, "..", "src", "cli.js");
const BIN = path.join(__dirname, "..", "bin", "hermad.js");

// Archivo de src/commands → nombre en la tabla. settings-* son submodulos de
// `settings`, no comandos propios.
const FILE_TO_COMMAND = { "settings-agents": "settings", "settings-project": "settings" };

// Flags que NO son de hermad (van a otro binario) y por eso no van en la tabla.
// Un flag externo nuevo se agrega aca con su motivo.
const NON_HERMAD = {
  "plan-devs.js": ["--list"], // git branch --list
  "skills.js": ["--model"], // pass-through al vendor en suggest
};

function flagsInSource(src) {
  return [...src.matchAll(/"(--[a-z][a-z-]*)"/g)].map((m) => m[1]);
}

test("cada entrada de COMMANDS tiene name, summary, flags, sub y run", () => {
  assert.ok(COMMANDS.length > 0);
  for (const c of COMMANDS) {
    assert.ok(c.name && typeof c.name === "string", "name falta");
    assert.equal(typeof c.summary, "string", `summary de ${c.name}`);
    assert.ok(Array.isArray(c.flags), `flags de ${c.name}`);
    assert.ok(Array.isArray(c.sub), `sub de ${c.name}`);
    assert.equal(typeof c.run, "function", `run de ${c.name}`);
  }
  const names = COMMANDS.map((c) => c.name);
  assert.equal(new Set(names).size, names.length, "nombres de comando duplicados");
});

test("la tabla declara los comandos finales de la epica (FR-6.3)", () => {
  for (const n of ["completion", "settings", "setup", "update", "spawn"]) {
    assert.ok(resolve(n), `falta el comando ${n}`);
  }
  for (const s of ["zsh", "bash", "fish", "powershell", "install", "uninstall"]) {
    assert.ok(resolve("completion").sub.includes(s), `completion sin sub ${s}`);
  }
  for (const s of ["agents", "project", "permissions"]) {
    assert.ok(resolve("settings").sub.includes(s), `settings sin sub ${s}`);
  }
  assert.ok(resolve("completion").flags.includes("--shell"));
  assert.ok(resolve("spawn").flags.includes("--story"));
});

test("todo --flag leido por src/commands/*.js esta en la tabla de su comando (FR-6.4)", () => {
  for (const file of fs.readdirSync(COMMANDS_DIR)) {
    if (!file.endsWith(".js")) continue;
    const command = FILE_TO_COMMAND[file.replace(/\.js$/, "")] || file.replace(/\.js$/, "");
    const entry = resolve(command);
    assert.ok(entry, `${file}: no hay comando '${command}' en la tabla`);
    const external = new Set(NON_HERMAD[file] || []);
    const src = fs.readFileSync(path.join(COMMANDS_DIR, file), "utf8");
    for (const flag of flagsInSource(src)) {
      if (external.has(flag)) continue;
      assert.ok(entry.flags.includes(flag), `${file}: '${flag}' no esta en COMMANDS.${command}.flags`);
    }
  }
});

test("el dispatch de cli.js es por tabla, sin switch hardcodeado", () => {
  const src = fs.readFileSync(CLI_SRC, "utf8");
  assert.match(src, /COMMANDS\.find/, "cli.js no resuelve el comando por COMMANDS");
  assert.ok(!/switch\s*\(\s*cmd\s*\)/.test(src), "cli.js todavia tiene el switch hardcodeado");
});

test("helpText se genera desde la tabla (summary + sub + flags)", () => {
  const help = helpText();
  for (const c of COMMANDS) {
    assert.ok(help.includes(c.name), `help sin el comando ${c.name}`);
    assert.ok(help.includes(c.summary), `help sin el summary de ${c.name}`);
  }
  assert.ok(help.includes("settings agents|project|permissions"));
  assert.ok(help.includes("completion zsh|bash|fish|powershell|install|uninstall"));
  assert.ok(help.includes("--story"));
});

test("la tabla es lazy: declara un handler inexistente sin romper el resto (FR-6.3)", () => {
  const completion = resolve("completion");
  assert.ok(completion, "falta completion en la tabla");
  // El require vive dentro de run(): la tabla carga sin el handler.
  assert.throws(() => completion.run(), /Cannot find module/);
  const help = execFileSync(process.execPath, [BIN, "--help"], { encoding: "utf8" });
  assert.match(help, /completion/);
  assert.doesNotThrow(() => execFileSync(process.execPath, [BIN, "--version"], { encoding: "utf8" }));
});

test("un comando desconocido imprime el HELP y sale 1 (FR-6.3)", () => {
  let err;
  try {
    execFileSync(process.execPath, [BIN, "nope-xyz"], { encoding: "utf8" });
  } catch (e) {
    err = e;
  }
  assert.ok(err, "deberia salir != 0");
  assert.equal(err.status, 1);
  assert.match(String(err.stderr), /comando desconocido: nope-xyz/);
  assert.match(String(err.stdout), /Uso:/);
});
