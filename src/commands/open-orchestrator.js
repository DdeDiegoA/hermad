"use strict";
const { resolveProject } = require("../lib/project");
const orchestrator = require("../lib/orchestrator");

// Abre el workspace con SOLO el orquestador (los workers se dropean bajo demanda
// desde Fase 7). El pane del daemon se suma en Fase 5.
function run() {
  const project = resolveProject();
  if (!project) {
    console.error('No hay proyecto: ni .hermad/project.json subiendo desde el cwd ni proyecto activo. Corré `hermad create-project "nombre"` primero.');
    process.exit(1);
  }
  orchestrator.bootstrap({ ...project, intent: null, onlyOrchestrator: true });
}

module.exports = { run };
