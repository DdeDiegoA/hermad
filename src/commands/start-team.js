"use strict";
const { resolveProject } = require("../lib/project");
const orchestrator = require("../lib/orchestrator");

// Arranca workspace + tabs por departamento + todos los agentes, sin prompt
// inicial al orquestador — quedan conectados e idle. El proyecto se resuelve
// subiendo desde el cwd (así `cd proyecto-B && hermad start-team` abre B).
function run() {
  const project = resolveProject();
  if (!project) {
    console.error('No hay proyecto: ni .hermad/project.json subiendo desde el cwd ni proyecto activo. Corré `hermad create-project "nombre"` primero.');
    process.exit(1);
  }
  orchestrator.bootstrap({ ...project, intent: null });
}

module.exports = { run };
