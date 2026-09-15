"use strict";
const readline = require("readline");

function rl() {
  return readline.createInterface({ input: process.stdin, output: process.stdout });
}

function ask(question) {
  const r = rl();
  return new Promise((resolve) => r.question(question, (answer) => { r.close(); resolve(answer.trim()); }));
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

module.exports = { ask, select };
