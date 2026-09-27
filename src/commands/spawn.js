"use strict";
const { resolveProject } = require("../lib/project");
const render = require("../lib/render");
const vendors = require("../lib/vendors");
const herdr = require("../lib/herdr");
const daemon = require("../lib/daemon");
const { startAgentSafe } = require("../lib/orchestrator");

// Único camino para que un agente (o un humano) dropee otro agente: pasa por
// render + vendors.startPlan, así hereda persona, skills, memoria y bypass de
// permisos igual que los que lanza start-team. No usar `herdr agent start` a mano.
function run(args) {
  const opt = (flag) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : null;
  };
  const persona = args.find((a, i) => !a.startsWith("--") && !["--name", "--pane"].includes(args[i - 1]));
  if (!persona) {
    console.error("Uso: hermad spawn <persona> [--name <agente>] [--pane <pane_id>]");
    process.exit(1);
  }
  const project = resolveProject();
  if (!project) {
    console.error("No hay proyecto (ni .hermad/project.json ni activo).");
    process.exit(1);
  }
  const p = (project.personas || {})[persona];
  if (!p) {
    console.error(`persona '${persona}' no definida en ${project.projectDir}/.hermad/project.json`);
    process.exit(1);
  }
  const name = opt("--name") || persona;

  // ponytail: sin --pane se apila bajo el pane del daemon (sin agente → split seguro);
  // ubicar en el tab de su departamento si el tablero se desordena.
  let paneId = opt("--pane");
  if (!paneId) {
    const { daemonPaneId } = daemon.loadState(project.projectDir);
    if (!daemonPaneId) {
      console.error("sin pane del daemon registrado: pasá --pane <id> (un pane sin agente corriendo).");
      process.exit(1);
    }
    paneId = herdr.paneSplit(daemonPaneId, "down", { cwd: project.projectDir }).paneId;
  }

  const artifacts = render.renderPersona({ projectDir: project.projectDir, agentName: name, name: persona, persona: p, compactPct: project.compactPct || 50 });
  startAgentSafe(name, p, paneId, vendors.startPlan(p.kind, persona, p, artifacts));
  console.log(`[+] ${name} (${persona}, ${p.kind}) en ${paneId}`);
}

module.exports = { run };
