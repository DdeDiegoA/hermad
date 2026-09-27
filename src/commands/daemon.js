"use strict";
const { resolveProject } = require("../lib/project");
const daemon = require("../lib/daemon");

// Corre en su propio pane (lo arranca start-team/open-orchestrator). Resuelve
// el proyecto desde el cwd del pane y entra en loop de poll.
function run() {
  const project = resolveProject();
  if (!project) {
    console.error("No hay proyecto para el daemon (ni .hermad/project.json ni activo).");
    process.exit(1);
  }
  daemon.loop(project);
}

module.exports = { run };
