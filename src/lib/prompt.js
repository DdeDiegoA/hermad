"use strict";
const readline = require("readline");

function rl() {
  return readline.createInterface({ input: process.stdin, output: process.stdout });
}

function ask(question) {
  const r = rl();
  return new Promise((resolve) => r.question(question, (answer) => { r.close(); resolve(answer.trim()); }));
}

// Error terminal del wizard con código de salida (setup lo traduce y no escribe
// un stack trace). Default 1; cancelación = 130 (ux §12.7).
class CancelledError extends Error {
  constructor() {
    super("setup cancelado");
    this.name = "CancelledError";
    this.exitCode = 130;
  }
}

class SetupError extends Error {
  constructor(message, exitCode = 1) {
    super(message);
    this.name = "SetupError";
    this.exitCode = exitCode;
  }
}

// Si el adaptador de UI marca el valor como cancelado, corta el paso.
function checkCancel(ui, value) {
  if (ui && typeof ui.cancelled === "function" && ui.cancelled(value)) throw new CancelledError();
  return value;
}

// Selector numerado — stdlib puro, sin flechas/TUI. Suficiente para setup una vez.
async function select(label, options, { defaultIndex = 0 } = {}) {
  console.log(label);
  options.forEach((opt, i) => console.log(`  ${i + 1}) ${typeof opt === "string" ? opt : opt.label}`));
  const answer = await ask(`Elegí [1-${options.length}] (default ${defaultIndex + 1}): `);
  const n = answer === "" ? defaultIndex : parseInt(answer, 10) - 1;
  if (Number.isNaN(n) || n < 0 || n >= options.length) {
    console.log("opción inválida, reintentá");
    return select(label, options, { defaultIndex });
  }
  return options[n];
}

module.exports = { ask, select, CancelledError, SetupError, checkCancel };
