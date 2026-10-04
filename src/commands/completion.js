"use strict";
const completion = require("../lib/completion/install");
const { COMMANDS } = require("../lib/commands-table");

// `hermad completion <shell>` imprime a stdout sin tocar disco (FR-6.1);
// `install`/`uninstall` escriben el bloque marcado en el shell elegido/
// detectado (FR-6.2/6.5).
const GENERATORS = {
  zsh: require("../lib/completion/zsh").generate,
  bash: require("../lib/completion/bash").generate,
  fish: require("../lib/completion/fish").generate,
  powershell: require("../lib/completion/powershell").generate,
};

function flagValue(args, name) {
  const i = args.indexOf(name);
  return i !== -1 ? args[i + 1] : null;
}

function usage() {
  console.error(
    [
      "Uso:",
      "  hermad completion <zsh|bash|fish|powershell>   imprime el script a stdout",
      "  hermad completion install [--shell X]          instala en el shell (o detecta)",
      "  hermad completion uninstall [--shell X]        revierte el bloque",
    ].join("\n")
  );
  process.exit(1);
}

async function run(args) {
  const sub = args[0];
  if (GENERATORS[sub]) {
    process.stdout.write(GENERATORS[sub](COMMANDS));
    return;
  }
  const shell = flagValue(args, "--shell");
  if (sub === "install") return completion.install(shell);
  if (sub === "uninstall") return completion.uninstall(shell);
  usage();
}

module.exports = { run, GENERATORS };
