"use strict";
const { loadActiveProject } = require("../lib/active-project");
const orchestrator = require("../lib/orchestrator");

// Igual que start-team pero con intent: arranca workspace + tabs + agentes Y
// le manda el briefing+intent al orquestador para que rute la ruta épica.
function run(args) {
  const intent = args.join(" ").trim();
  if (!intent) {
    console.error('Uso: hermad orchestrate "intent del proyecto"');
    process.exit(1);
  }
  const project = loadActiveProject();
  if (!project) {
    console.error('No hay proyecto activo. Corré `hermad create-project "nombre"` primero.');
    process.exit(1);
  }
  orchestrator.bootstrap({ ...project, intent });
}

module.exports = { run };
