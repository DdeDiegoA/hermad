"use strict";
const { resolveProject } = require("../lib/project");
const memory = require("../lib/memory");

// `hermad memory slice <persona> [--story X]` — imprime el bloque atómico
// (AGENTS.md + entradas para esa persona/story). Lo usa el hook SessionStart.
function run(args) {
  if (args[0] !== "slice" || !args[1]) {
    console.error("Uso: hermad memory slice <persona> [--story X]");
    process.exit(1);
  }
  const persona = args[1];
  const storyIdx = args.indexOf("--story");
  const story = storyIdx >= 0 ? args[storyIdx + 1] : null;
  const project = resolveProject();
  if (!project) {
    // exit 0: lo llama el hook SessionStart y no debe romper el arranque del agente.
    console.error("No hay proyecto (ni .hermad/project.json ni activo).");
    return;
  }
  const out = memory.slice(project.projectDir, { persona, story });
  if (out) process.stdout.write(out + "\n");
}

module.exports = { run };
