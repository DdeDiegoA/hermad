"use strict";

const { COMMANDS, helpText } = require("./lib/commands-table");

async function main(argv) {
  const [cmd, ...rest] = argv;

  if (!cmd || cmd === "--help" || cmd === "-h" || cmd === "help") {
    console.log(helpText());
    return;
  }
  if (cmd === "--version" || cmd === "-v") {
    console.log(require("../package.json").version);
    return;
  }

  const entry = COMMANDS.find((c) => c.name === cmd);
  if (!entry) {
    console.error(`comando desconocido: ${cmd}\n`);
    console.log(helpText());
    process.exit(1);
  }

  try {
    await entry.run().run(rest);
  } catch (err) {
    console.error(`hermad: ${err.message}`);
    process.exit(1);
  }
}

module.exports = { main };
