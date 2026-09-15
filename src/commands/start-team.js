"use strict";
const { loadActiveProject } = require("../lib/active-project");
const orchestrator = require("../lib/orchestrator");

// Arranca workspace + tabs por departamento + todos los agentes, sin prompt
// inicial al orquestador — quedan conectados e idle.
function run() {
  const project = loadActiveProject();
  if (!project) {
    console.error('No hay proyecto activo. Corré `hermad create-project "nombre"` primero.');
    process.exit(1);
  }
  orchestrator.bootstrap({ ...project, intent: null });
}

module.exports = { run };
